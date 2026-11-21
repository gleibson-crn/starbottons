import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import type {
  EditorTransform,
  Framing,
  ImageFilters,
  PrintSpec,
  StyleEffect,
  UploadRecord,
} from '../../../shared/types';
import {
  DEFAULT_BACKGROUND_FRAMING,
  DEFAULT_FILTERS,
  DEFAULT_STYLE_EFFECT,
  DEFAULT_TRANSFORM,
} from '../../../shared/types';
import {
  BackgroundPicker,
  CanvasEditor,
  FileDropzone,
  ResolutionBadge,
  TreatPanel,
  clearBackgroundImage,
  resetTransform,
  toggleFlipH,
  toggleFlipV,
  withBackgroundImage,
} from '../../../shared/ui';
import {
  effectiveDpi,
  fallbackSpec,
  loadImage,
  rovingNext,
} from '../../../shared/utils';
import { largestSelectedSize, type BatchItem } from '../../../core/batch';
import { UploadService } from '../../../core/upload';
import {
  BackgroundTemplateService,
  type BackgroundTemplate,
} from '../../../core/backgrounds';
import {
  FrameTemplateService,
  type FrameTemplate,
} from '../../../core/frames';
import {
  framingOf,
  loadGallery,
  loadLayerImageEl,
  sameFraming,
  uploadLayerImage,
  type GalleryPhase,
} from './batch-editor-dialog.util';
import { AiStylePanel, type AiStyleResult } from '../ai-style-panel/ai-style-panel';
import {
  RemoveBgPanel,
  type CutoutCommit,
  type CutoutPanelResult,
} from '../remove-bg-panel/remove-bg-panel';
import { FrameLayers } from './frame-layers';
import { FrameBgEditor } from '../../frames/frame-bg-editor/frame-bg-editor';

/** Ajuste salvo pelo diálogo (vale p/ todos os tamanhos da imagem). */
export interface BatchEditResult {
  readonly transform: EditorTransform;
  readonly editorSide: number;
  readonly filters: ImageFilters;
  readonly style: StyleEffect;
  /** Trilha 2 (ADR-021): imagem estilizada por IA neste diálogo? */
  readonly aiStyled?: boolean;
  /** Upload tratado full-res ESTILIZADO, quando `aiStyled`. */
  readonly generationUpload?: UploadRecord | null;
  /** "Remover fundo": o recorte mudou neste diálogo (novo ou desfeito)? */
  readonly cutoutChanged?: boolean;
  /** Upload do recorte (PNG com alfa), ou `null` ao desfazer. */
  readonly cutoutUpload?: UploadRecord | null;
  /** Prévia (dataURL) da face composta, para exibir no card do lote. */
  readonly facePreview?: string;
}

/** Aba do painel do diálogo. */
type TabId = 'adjust' | 'treat' | 'background' | 'frame';

interface EditorTab {
  readonly id: TabId;
  readonly label: string;
}

const EDITOR_TABS: readonly EditorTab[] = [
  { id: 'adjust', label: 'Ajustar' },
  { id: 'treat', label: 'Tratar' },
  { id: 'background', label: 'Fundo' },
  { id: 'frame', label: 'Moldura' },
];

/** MIME aceito na dropzone de moldura: só PNG (transparência revela a arte). */
const FRAME_ACCEPT: readonly string[] = ['image/png'];

/**
 * BatchEditorDialog — modal de UMA imagem do lote. A PRÉVIA (CanvasEditor, spec
 * do MAIOR tamanho selecionado) é PERSISTENTE no topo — sempre visível — para
 * que enquadramento, filtros e fundo apareçam ao vivo em qualquer aba. Abaixo,
 * abas ARIA de CONTROLES: "Ajustar" (instruções de enquadramento + redefinir),
 * "Tratar" (TreatPanel: presets + sliders) e "Fundo" (BackgroundPicker: cor
 * sólida sob a imagem). Acessibilidade: `role="dialog"` + `aria-modal`, Esc
 * fecha, `role="tablist"` com navegação ←/→/Home/End; ao confirmar devolve
 * transform + filters (valem para todos os tamanhos da imagem).
 */
@Component({
  selector: 'app-batch-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CanvasEditor,
    ResolutionBadge,
    TreatPanel,
    BackgroundPicker,
    FileDropzone,
    AiStylePanel,
    RemoveBgPanel,
    FrameBgEditor,
  ],
  host: { '(keydown)': 'onKeydown($event)' },
  templateUrl: './batch-editor-dialog.html',
  styleUrl: './batch-editor-dialog.scss',
})
export class BatchEditorDialog implements OnInit {
  private readonly uploads = inject(UploadService);
  private readonly bgTemplatesService = inject(BackgroundTemplateService);
  private readonly frameTemplatesService = inject(FrameTemplateService);

  /**
   * Trilha 2 (ADR-021): a seção "Estilo com IA" foi extraída para o
   * `AiStylePanel` (BL-001). O painel injeta o registry/crédito e altera a
   * prévia via `resultChange`; o diálogo lê `aiStyled`/`generationUpload` no
   * `onSave` a partir deste `viewChild`.
   */
  private readonly aiPanel = viewChild(AiStylePanel);
  private readonly removePanel = viewChild(RemoveBgPanel);

  /** `true` enquanto o recorte novo é enviado (Salvar fica inativo). */
  readonly saving = signal(false);
  /** `true` quando a prévia mostra o recorte (DPI usa o tamanho do original). */
  readonly cutoutActive = signal(false);
  /** Recorte já salvo no item (reabrir o diálogo). */
  readonly savedCutout = computed(() =>
    this.item().cutout ? (this.item().cutoutUpload ?? null) : null,
  );

  /** Imagem ORIGINAL (crua) — fonte de TODO estilo de IA (nunca a já estilizada,
   * senão empilharia estilos). Capturada no hydrate; passada ao AiStylePanel. */
  readonly originalImage = signal<HTMLImageElement | null>(null);
  /** Filtros/estilo locais ANTES de qualquer IA — restaurados ao reverter à
   * imagem original (a IA zera o tratamento; voltar deve recuperá-lo). */
  readonly originalFilters = signal<ImageFilters>(DEFAULT_FILTERS);
  readonly originalStyle = signal<StyleEffect>(DEFAULT_STYLE_EFFECT);

  readonly item = input.required<BatchItem>();
  readonly saved = output<BatchEditResult>();
  readonly closed = output<void>();

  readonly image = signal<HTMLImageElement | null>(null);
  readonly transform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  readonly filters = signal<ImageFilters>(DEFAULT_FILTERS);
  /** Efeito de estilo por pixel (ADR-019); alimenta a prévia e o bake. */
  readonly style = signal<StyleEffect>(DEFAULT_STYLE_EFFECT);
  private readonly canvas = viewChild(CanvasEditor);

  /** Imagem de fundo já carregada para o preview (ou `null`). */
  readonly bgImageEl = signal<HTMLImageElement | null>(null);
  /** `true` enquanto um upload de fundo está em curso. */
  readonly bgUploading = signal(false);
  /** Mensagem de erro do último upload de fundo (ou `null`). */
  readonly bgError = signal<string | null>(null);
  /** Galeria de templates de fundo pré-cadastrados (curadoria). */
  readonly bgTemplates = signal<BackgroundTemplate[]>([]);
  /** Fase de carregamento da galeria de templates. */
  readonly bgGalleryPhase = signal<GalleryPhase>('idle');
  /**
   * Enquadramento do fundo (posição/zoom/rotação) enquanto se edita. É a fonte
   * que o CanvasEditor muta ao arrastar na prévia; um `effect` grava de volta em
   * `transform.backgroundImage` para persistir/serializar.
   */
  readonly bgTransform = signal<Framing>(DEFAULT_BACKGROUND_FRAMING);
  private readonly bgUrl = computed(
    () => this.transform().backgroundImage?.url ?? null,
  );

  /** MIME aceito pela dropzone de moldura (só PNG). */
  readonly frameAccept = FRAME_ACCEPT;
  /** Galeria de templates de moldura pré-cadastrados (curadoria). */
  readonly frameTemplates = signal<FrameTemplate[]>([]);
  /** Fase de carregamento da galeria de molduras. */
  readonly frameGalleryPhase = signal<GalleryPhase>('idle');
  /** Pilha de molduras (ADR-023): estado + operações (até 3). A UI chama `frames.*`. */
  readonly frames = new FrameLayers(this.transform, this.uploads, () => this.editorSide());

  /**
   * Camada dos gestos na prévia: `'background'` quando a aba "Fundo" está ativa E
   * há imagem de fundo (arrastar/rolar/girar movem o FUNDO); `'frame'` quando a
   * aba "Moldura" está ativa (moldura é COVER fixo → gestos inertes, não movem a
   * arte por engano); senão `'art'`.
   */
  readonly bgLayer = computed<'art' | 'background' | 'frame'>(() => {
    if (this.activeTab() === 'frame') {
      return 'frame';
    }
    return this.activeTab() === 'background' && this.transform().backgroundImage
      ? 'background'
      : 'art';
  });

  constructor() {
    effect(() => this.syncBackgroundImageEl(this.bgUrl()));
    effect(() => this.persistBgTransform(this.bgTransform()));
    // Recarrega as imagens das molduras só quando o conjunto/ordem de URLs muda
    // (não a cada gesto de enquadramento). O cache evita recarregar ao reordenar.
    effect(() => {
      this.frames.urlsKey();
      untracked(() => this.frames.syncEls());
    });
    effect(() => {
      if (this.activeTab() === 'background') {
        void this.loadBgTemplates();
      }
    });
    effect(() => {
      if (this.activeTab() === 'frame') {
        void this.loadFrameTemplates();
      }
    });
  }

  /** Lado atual (px) do editor — referência dos offsets das molduras. */
  readonly editorSide = computed(
    () => this.canvas()?.side() ?? this.item().editorSide,
  );

  readonly tabs = EDITOR_TABS;
  readonly activeTab = signal<TabId>('adjust');
  private readonly tabButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  readonly spec = computed<PrintSpec>(() => {
    const size = largestSelectedSize(this.item()) ?? 58;
    const spec = fallbackSpec('round', size);
    if (!spec) {
      throw new Error(`Sem print_spec para ${size}mm.`);
    }
    return spec;
  });

  readonly dpi = computed(() => {
    const img = this.image();
    if (!img) {
      return 0;
    }
    // O recorte é reduzido (≤1280px): o DPI vale pelo tamanho do ORIGINAL.
    const orig = this.cutoutActive() && this.item().width > 0 ? this.item() : img;
    return effectiveDpi({
      naturalWidth: 'naturalWidth' in orig ? orig.naturalWidth : orig.width,
      naturalHeight: 'naturalHeight' in orig ? orig.naturalHeight : orig.height,
      scale: this.transform().scale,
      spec: this.spec(),
    });
  });

  ngOnInit(): void {
    const t = this.item().transform;
    this.transform.set(t);
    this.filters.set(this.item().filters);
    this.style.set(this.item().style ?? DEFAULT_STYLE_EFFECT);
    // Snapshot do tratamento local para restaurar ao reverter a IA.
    this.originalFilters.set(this.item().filters);
    this.originalStyle.set(this.item().style ?? DEFAULT_STYLE_EFFECT);
    this.bgTransform.set(framingOf(t.backgroundImage));
    void this.hydrate();
  }

  /**
   * Aplica na prévia o resultado emitido pelo `AiStylePanel` (aplicação ou
   * revert): a imagem só é trocada quando presente (no revert sem original
   * capturada, mantém a atual); filtros/estilo sempre acompanham o painel.
   */
  onAiResult(result: AiStyleResult): void {
    if (result.image) {
      this.image.set(result.image);
    }
    this.filters.set(result.filters);
    this.style.set(result.style);
  }

  /** Prévia: mostra o recorte (ativo) ou volta à foto original (desfeito). */
  onCutoutResult(result: CutoutPanelResult): void {
    this.cutoutActive.set(result.active);
    if (result.image) {
      this.image.set(result.image);
    }
  }

  selectTab(id: TabId): void {
    this.activeTab.set(id);
  }

  /** Carrega os templates de fundo (uma vez; `force` reexecuta após erro). */
  loadBgTemplates(force = false): Promise<void> {
    return loadGallery(
      this.bgGalleryPhase,
      this.bgTemplates,
      () => this.bgTemplatesService.list(),
      force,
    );
  }

  /** Aplica um template de fundo pré-cadastrado; o preview reflete ao vivo. */
  pickTemplate(tpl: BackgroundTemplate): void {
    if (!tpl.thumbUrl) {
      return;
    }
    this.bgError.set(null);
    this.transform.update((t) =>
      withBackgroundImage(t, {
        path: tpl.storagePath,
        url: tpl.thumbUrl!,
        source: 'template',
        id: tpl.id,
      }),
    );
    // Nova imagem → posição do fundo reinicia (centrado, cover, 0°).
    this.bgTransform.set(DEFAULT_BACKGROUND_FRAMING);
  }

  /** Troca a cor de fundo (aba "Fundo"); o preview reflete ao vivo. */
  onBackground(color: string): void {
    this.transform.update((t) => ({ ...t, background: color }));
  }

  /** Sobe o arquivo escolhido e o define como imagem de fundo. */
  async onBackgroundFile(file: File): Promise<void> {
    this.bgError.set(null);
    this.bgUploading.set(true);
    try {
      const ref = await uploadLayerImage(file, this.uploads);
      this.transform.update((t) => withBackgroundImage(t, ref));
      // Nova imagem → posição do fundo reinicia (centrado, cover, 0°).
      this.bgTransform.set(DEFAULT_BACKGROUND_FRAMING);
    } catch (err) {
      this.bgError.set(
        err instanceof Error ? err.message : 'Falha ao enviar a imagem de fundo.',
      );
    } finally {
      this.bgUploading.set(false);
    }
  }

  /** Recusa de arquivo pela dropzone (formato/tamanho). */
  onBackgroundFileRejected(reason: string): void {
    this.bgError.set(reason);
  }

  /** Remove a imagem de fundo (volta a usar só a cor). */
  removeBackgroundImage(): void {
    this.bgError.set(null);
    this.transform.update((t) => clearBackgroundImage(t));
    this.bgTransform.set(DEFAULT_BACKGROUND_FRAMING);
  }

  /** Carrega os templates de moldura (uma vez; `force` reexecuta após erro). */
  loadFrameTemplates(force = false): Promise<void> {
    return loadGallery(
      this.frameGalleryPhase,
      this.frameTemplates,
      () => this.frameTemplatesService.list(),
      force,
    );
  }

  /** Redefine posição/zoom/rotação (aba "Ajustar"); preserva o fundo escolhido. */
  resetFraming(): void {
    this.transform.update((t) => resetTransform(t));
  }

  /** Espelha a arte na horizontal (aba "Ajustar"). */
  toggleFlipH(): void {
    this.transform.update((t) => toggleFlipH(t));
  }

  /** Espelha a arte na vertical (aba "Ajustar"). */
  toggleFlipV(): void {
    this.transform.update((t) => toggleFlipV(t));
  }

  /** Redefine a posição/zoom/rotação DO FUNDO (centrado, cover, 0°). */
  resetBackground(): void {
    this.bgTransform.set(DEFAULT_BACKGROUND_FRAMING);
  }

  /** Navegação ARIA por teclado (←/→/Home/End) com ativação automática. */
  onTabKeydown(event: KeyboardEvent): void {
    const current = this.tabIndex();
    const next = this.nextTabIndex(event, current);
    if (next === current) {
      return;
    }
    event.preventDefault();
    this.activeTab.set(this.tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  onSave(): void {
    const cutoutPanel = this.removePanel();
    if (cutoutPanel?.mode() !== 'fresh') {
      this.emitSaved(cutoutPanel?.settledCommit() ?? { changed: false, upload: null });
      return;
    }
    this.saving.set(true);
    cutoutPanel
      .commit()
      .then((commit) => this.emitSaved(commit))
      .catch(() => undefined) // o painel já avisou via ModalService
      .finally(() => this.saving.set(false));
  }

  private emitSaved(cutout: CutoutCommit): void {
    const panel = this.aiPanel();
    const canvas = this.canvas();
    this.saved.emit({
      transform: this.transform(),
      editorSide: canvas?.side() ?? this.item().editorSide,
      filters: this.filters(),
      style: this.style(),
      aiStyled: panel?.aiStyled() ?? false,
      generationUpload: panel?.generationUpload() ?? null,
      cutoutChanged: cutout.changed,
      cutoutUpload: cutout.upload,
      facePreview: canvas?.faceSnapshot() ?? undefined,
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.onClose();
    }
  }

  private tabIndex(): number {
    return this.tabs.findIndex((t) => t.id === this.activeTab());
  }

  private nextTabIndex(event: KeyboardEvent, current: number): number {
    if (event.key === 'Home') {
      return 0;
    }
    if (event.key === 'End') {
      return this.tabs.length - 1;
    }
    return rovingNext(this.tabs.length, current, event.key, () => true);
  }

  private async hydrate(): Promise<void> {
    const img = await loadImage(this.item().previewUrl);
    this.image.set(img);
    this.originalImage.set(img); // fonte crua p/ todo estilo de IA
    await this.showSavedCutout();
  }

  /** Reabrindo com recorte salvo: a prévia parte do recorte, não do original. */
  private async showSavedCutout(): Promise<void> {
    const url = this.savedCutout()?.previewUrl;
    if (!url) {
      return;
    }
    try {
      this.image.set(await loadImage(url));
      this.cutoutActive.set(true);
    } catch {
      // Recorte indisponível (URL expirada): segue com o original.
    }
  }

  /** Carrega (ou limpa) o `HTMLImageElement` do fundo conforme a URL atual. */
  private syncBackgroundImageEl(url: string | null): void {
    loadLayerImageEl(
      url,
      this.bgImageEl,
      (u) => this.transform().backgroundImage?.url === u,
    );
  }

  /**
   * Grava o enquadramento do fundo de volta em `transform.backgroundImage` para
   * persistir/serializar. Lê/escreve `transform` em `untracked` (só rastreia
   * `bgTransform`) e não escreve quando já está sincronizado — evitando loop.
   */
  private persistBgTransform(bt: Framing): void {
    untracked(() => {
      const cur = this.transform();
      const bg = cur.backgroundImage;
      if (!bg || sameFraming(bg, bt)) {
        return;
      }
      this.transform.set({
        ...cur,
        backgroundImage: {
          ...bg,
          offset: bt.offset,
          scale: bt.scale,
          rotation: bt.rotation,
        },
      });
    });
  }
}
