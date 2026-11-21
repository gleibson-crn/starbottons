import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FrameLayers } from '../../batch/batch-editor-dialog/frame-layers';
import {
  FrameTemplateService,
  MAX_COMPOSITION_LAYERS,
  FRAME_RASTERIZER,
  type CompositionLayer,
  type CompositionLayerInput,
  type FrameTemplate,
} from '../../../core/frames';
import { UploadService } from '../../../core/upload';
import { CanvasEditor, FileDropzone } from '../../../shared/ui';
import { FrameBgEditor } from '../frame-bg-editor/frame-bg-editor';
import { computeLayout, fallbackSpec } from '../../../shared/utils';
import {
  DEFAULT_TRANSFORM,
  type EditorTransform,
  type Framing,
  type PrintSpec,
} from '../../../shared/types';
import { loadNeutralArt } from '../neutral-art';

const PNG_ONLY: readonly string[] = ['image/png'];
const REF_SIDE = 1000;

/** Spec fixa (58mm redondo) — a mesma do editor de enquadramento. */
function buildSpec(): PrintSpec {
  const spec = fallbackSpec('round', 58);
  if (!spec) {
    throw new Error('Sem print_spec para 58mm.');
  }
  return spec;
}

/** Razão `diâmetro visível (cutR*2) / lado do editor` — fixa por spec. */
function diameterRatio(spec: PrintSpec): number {
  return (computeLayout(spec, REF_SIDE).cutR * 2) / REF_SIDE;
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * FrameComposer — aba "Camadas" da curadoria de molduras (composição por
 * camadas, até 8). Reusa o `CanvasEditor` (layer='frame') + `FrameLayers`
 * (max = 8) sobre uma arte neutra. Camadas: subir PNG ou copiar de uma moldura
 * cadastrada (entra NEUTRA). Ao salvar, normaliza os offsets (fração do lado),
 * rasteriza o PNG achatado (`renderFramesComposite`) e chama `saveComposition`.
 *
 * Acessibilidade: lista rotulada ("fundo → topo"), botões nativos (↑/↓/remover/
 * selecionar com `aria-pressed`), dropzone por teclado, erro em `role="alert"`;
 * o canvas aceita setas, +/- e `[`/`]` para a camada ativa.
 */
@Component({
  selector: 'app-frame-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasEditor, FileDropzone, FrameBgEditor],
  templateUrl: './frame-composer.html',
  styleUrl: './frame-composer.scss',
})
export class FrameComposer implements OnInit {
  private readonly frameTemplates = inject(FrameTemplateService);
  private readonly rasterize = inject(FRAME_RASTERIZER);

  readonly template = input.required<FrameTemplate>();
  /** Molduras cadastradas, disponíveis p/ "Usar moldura cadastrada". */
  readonly library = input<FrameTemplate[]>([]);
  readonly saved = output<FrameTemplate>();

  readonly canvas = viewChild(CanvasEditor);
  readonly spec = buildSpec();
  readonly accept = PNG_ONLY;
  readonly max = MAX_COMPOSITION_LAYERS;
  readonly saving = signal(false);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly sampleArt = signal<HTMLImageElement | null>(null);
  readonly artTransform = signal<EditorTransform>(DEFAULT_TRANSFORM);

  private readonly frameTransform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  readonly frames = new FrameLayers(
    this.frameTransform,
    inject(UploadService),
    () => this.canvas()?.side() ?? 0,
    MAX_COMPOSITION_LAYERS,
  );
  /** Camadas salvas (offset em fração) a denormalizar pelo lado do canvas. */
  private readonly stored = signal<readonly CompositionLayer[]>([]);
  private touched = false;

  constructor() {
    effect(() => {
      this.frames.urlsKey();
      untracked(() => this.frames.syncEls());
    });
    effect(() => {
      const side = this.canvas()?.side() ?? 0;
      const stored = this.stored();
      if (side > 0 && stored.length > 0 && !this.touched) {
        untracked(() => this.applyStored(stored, side));
      }
    });
  }

  async ngOnInit(): Promise<void> {
    loadNeutralArt((img) => this.sampleArt.set(img));
    try {
      const layers = await this.frameTemplates.listLayers(this.template().id);
      for (const l of layers) {
        this.frames.addNeutral({
          path: l.storagePath,
          url: l.url,
          source: l.source,
          id: l.originTemplateId ?? undefined,
        });
      }
      this.stored.set(layers);
      this.frames.select(layers.length - 1);
    } catch (err) {
      this.error.set(errMsg(err, 'Falha ao carregar as camadas.'));
    } finally {
      this.loading.set(false);
    }
  }

  onFramingChange(e: { index: number; framing: Framing }): void {
    this.touched = true;
    this.frames.applyFraming(e);
  }

  async onFile(file: File): Promise<void> {
    this.touched = true;
    await this.frames.addUpload(file);
  }

  /** Copia o PNG da moldura cadastrada e empilha como camada NEUTRA independente. */
  async addFromLibrary(tpl: FrameTemplate): Promise<void> {
    if (!this.frames.canAdd() || this.busy()) {
      return;
    }
    this.touched = true;
    this.error.set(null);
    this.busy.set(true);
    try {
      const path = await this.frameTemplates.copyPng(tpl.storagePath);
      const url = await this.frameTemplates.signThumb(path);
      if (!url) {
        throw new Error('Não foi possível exibir a camada copiada.');
      }
      this.frames.addNeutral({ path, url, source: 'template', id: tpl.id });
    } catch (err) {
      this.error.set(errMsg(err, 'Falha ao copiar a moldura.'));
    } finally {
      this.busy.set(false);
    }
  }

  remove(index: number): void {
    this.touched = true;
    this.frames.removeAt(index);
  }

  /** Redefine (COVER) o enquadramento da camada do índice. */
  reset(index: number): void {
    this.touched = true;
    this.frames.resetAt(index);
  }

  moveUp(index: number): void {
    this.touched = true;
    this.frames.moveUp(index);
  }

  moveDown(index: number): void {
    this.touched = true;
    this.frames.moveDown(index);
  }

  async save(): Promise<void> {
    const side = this.canvas()?.side() ?? 0;
    if (!side || this.saving()) {
      return;
    }
    const count = this.frames.refs().length;
    if (count < 1 || count > MAX_COMPOSITION_LAYERS) {
      this.error.set(`A moldura precisa ter de 1 a ${MAX_COMPOSITION_LAYERS} camadas.`);
      return;
    }
    this.error.set(null);
    this.notice.set(null);
    this.saving.set(true);
    try {
      const blob = await this.rasterize(
        this.frames.imageEls(),
        this.normalized(side),
        REF_SIDE,
        diameterRatio(this.spec),
      );
      const updated = await this.frameTemplates.saveComposition(
        this.template().id,
        this.toInputs(side),
        blob,
      );
      this.notice.set('Composição salva.');
      this.saved.emit(updated);
    } catch (err) {
      this.error.set(errMsg(err, 'Falha ao salvar a composição.'));
    } finally {
      this.saving.set(false);
    }
  }

  private normalized(side: number): Framing[] {
    return this.frames.framings().map((f) => ({
      offset: { x: f.offset.x / side, y: f.offset.y / side },
      scale: f.scale,
      rotation: f.rotation,
    }));
  }

  private toInputs(side: number): CompositionLayerInput[] {
    const norm = this.normalized(side);
    return this.frames.refs().map((r, i) => ({
      storagePath: r.path,
      offset: norm[i].offset,
      scale: norm[i].scale,
      rotation: norm[i].rotation,
      source: r.source,
      originTemplateId: r.id ?? null,
    }));
  }

  private applyStored(stored: readonly CompositionLayer[], side: number): void {
    stored.forEach((l, index) => {
      this.frames.applyFraming({
        index,
        framing: {
          offset: { x: l.offset.x * side, y: l.offset.y * side },
          scale: l.scale,
          rotation: l.rotation,
        },
      });
    });
  }
}
