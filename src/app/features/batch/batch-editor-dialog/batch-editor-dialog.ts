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
  viewChild,
  viewChildren,
} from '@angular/core';
import type {
  EditorTransform,
  ImageFilters,
  PrintSpec,
} from '../../../shared/types';
import { DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../../../shared/types';
import {
  BackgroundPicker,
  CanvasEditor,
  FileDropzone,
  ResolutionBadge,
  TreatPanel,
  clearBackgroundImage,
  resetTransform,
  withBackgroundImage,
} from '../../../shared/ui';
import { effectiveDpi, fallbackSpec, loadImage, rovingNext } from '../../../shared/utils';
import { largestSelectedSize, type BatchItem } from '../../../core/batch';
import { UploadService } from '../../../core/upload';

/** Ajuste salvo pelo diálogo (vale p/ todos os tamanhos da imagem). */
export interface BatchEditResult {
  readonly transform: EditorTransform;
  readonly editorSide: number;
  readonly filters: ImageFilters;
}

/** Aba do painel do diálogo. */
type TabId = 'adjust' | 'treat' | 'background';

/** Modo do painel "Fundo": cor sólida ou imagem por upload. */
type BackgroundMode = 'color' | 'image';

interface EditorTab {
  readonly id: TabId;
  readonly label: string;
}

const EDITOR_TABS: readonly EditorTab[] = [
  { id: 'adjust', label: 'Ajustar' },
  { id: 'treat', label: 'Tratar' },
  { id: 'background', label: 'Fundo' },
];

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
  ],
  host: { '(keydown)': 'onKeydown($event)' },
  templateUrl: './batch-editor-dialog.html',
  styleUrl: './batch-editor-dialog.scss',
})
export class BatchEditorDialog implements OnInit {
  private readonly uploads = inject(UploadService);
  readonly item = input.required<BatchItem>();
  readonly saved = output<BatchEditResult>();
  readonly closed = output<void>();

  readonly image = signal<HTMLImageElement | null>(null);
  readonly transform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  readonly filters = signal<ImageFilters>(DEFAULT_FILTERS);
  private readonly canvas = viewChild(CanvasEditor);

  /** Modo do painel "Fundo" (cor sólida vs imagem por upload). */
  readonly bgMode = signal<BackgroundMode>('color');
  /** Imagem de fundo já carregada para o preview (ou `null`). */
  readonly bgImageEl = signal<HTMLImageElement | null>(null);
  /** `true` enquanto um upload de fundo está em curso. */
  readonly bgUploading = signal(false);
  /** Mensagem de erro do último upload de fundo (ou `null`). */
  readonly bgError = signal<string | null>(null);
  private readonly bgUrl = computed(
    () => this.transform().backgroundImage?.url ?? null,
  );

  constructor() {
    effect(() => this.syncBackgroundImageEl(this.bgUrl()));
  }

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
    return effectiveDpi({
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      scale: this.transform().scale,
      spec: this.spec(),
    });
  });

  ngOnInit(): void {
    const t = this.item().transform;
    this.transform.set(t);
    this.filters.set(this.item().filters);
    this.bgMode.set(t.backgroundImage ? 'image' : 'color');
    void this.hydrate();
  }

  selectTab(id: TabId): void {
    this.activeTab.set(id);
  }

  /** Alterna o modo do painel "Fundo" (cor | imagem). */
  setBgMode(mode: BackgroundMode): void {
    this.bgMode.set(mode);
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
      const probe = await this.uploads.probe(file);
      const rec = await this.uploads.upload(file, probe);
      this.transform.update((t) =>
        withBackgroundImage(t, {
          path: rec.path,
          url: rec.previewUrl,
          source: 'upload',
        }),
      );
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

  /** Remove a imagem de fundo (volta a usar a cor). */
  removeBackgroundImage(): void {
    this.bgError.set(null);
    this.transform.update((t) => clearBackgroundImage(t));
  }

  /** Redefine posição/zoom/rotação (aba "Ajustar"); preserva o fundo escolhido. */
  resetFraming(): void {
    this.transform.update((t) => resetTransform(t));
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
    this.saved.emit({
      transform: this.transform(),
      editorSide: this.canvas()?.side() ?? this.item().editorSide,
      filters: this.filters(),
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
    this.image.set(await loadImage(this.item().previewUrl));
  }

  /** Carrega (ou limpa) o `HTMLImageElement` do fundo conforme a URL atual. */
  private syncBackgroundImageEl(url: string | null): void {
    if (!url) {
      this.bgImageEl.set(null);
      return;
    }
    void loadImage(url).then((img) => {
      if (this.transform().backgroundImage?.url === url) {
        this.bgImageEl.set(img);
      }
    });
  }
}
