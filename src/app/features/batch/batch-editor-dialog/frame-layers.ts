import { computed, signal, type WritableSignal } from '@angular/core';
import type { EditorTransform, Framing } from '../../../shared/types';
import { DEFAULT_BACKGROUND_FRAMING } from '../../../shared/types';
import type { UploadService } from '../../../core/upload';
import {
  MAX_FRAMES,
  addFrameImage,
  canAddFrame,
  removeFrameImageAt,
  replaceFrameImageAt,
  reorderFrame,
  updateFrameFramingAt,
} from '../../../shared/ui';
import type { FrameTemplate } from '../../../core/frames';
import {
  activeAfterRemove,
  activeAfterReorder,
  loadFrameEls,
  uploadLayerImage,
} from './batch-editor-dialog.util';

/**
 * Controller HEADLESS da PILHA DE MOLDURAS (ADR-023) — extraído do
 * `BatchEditorDialog` (débito BL-001: o diálogo estourava o `max-lines`).
 * Concentra o estado (índice ativo, imagens carregadas, upload/erro) e as
 * operações (empilhar até 3, remover, reordenar z-order, selecionar ativa,
 * aplicar/zerar enquadramento), operando sobre o `transform` do diálogo (fonte
 * única). O diálogo só instancia e a UI chama `frames.*`.
 */
export class FrameLayers {
  /** Índice da moldura ATIVA (alvo dos gestos na prévia); -1 = nenhuma. */
  readonly activeIndex = signal<number>(-1);
  /** `HTMLImageElement` de cada moldura, alinhado por índice (null = carregando). */
  readonly imageEls = signal<readonly (HTMLImageElement | null)[]>([]);
  /** `true` enquanto um upload de moldura está em curso. */
  readonly uploading = signal(false);
  /** Índice da moldura com o painel "Remover fundo" ABERTO (-1 = nenhum). */
  readonly bgEditIndex = signal<number>(-1);
  /** Mensagem de erro do último upload/limite (ou `null`). */
  readonly error = signal<string | null>(null);
  private readonly cache = new Map<string, HTMLImageElement>();

  /** Molduras empilhadas (z-order) — fonte: `transform().frameImages`. */
  readonly refs = computed(() => this.transform().frameImages);
  /** `true` se ainda cabe adicionar moldura (teto de 3). */
  readonly canAdd = computed(() => canAddFrame(this.transform(), this.max));
  /** Enquadramento de cada moldura (one-way p/ o CanvasEditor). */
  readonly framings = computed<Framing[]>(() =>
    this.transform().frameImages.map((f) => ({
      offset: f.offset,
      scale: f.scale,
      rotation: f.rotation,
    })),
  );
  /** Assinatura das URLs (ordem+conjunto): dispara recarga só na mudança estrutural. */
  readonly urlsKey = computed(() =>
    this.transform().frameImages.map((f) => f.url).join('\n'),
  );

  constructor(
    private readonly transform: WritableSignal<EditorTransform>,
    private readonly uploads: Pick<UploadService, 'probe' | 'upload'>,
    /** Lado atual (px) do editor — denormaliza o enquadramento padrão (fração). */
    private readonly getEditorSide: () => number = () => 0,
    /** Teto de camadas (default `MAX_FRAMES`=3, o do botton). */
    private readonly max = MAX_FRAMES,
  ) {}

  /** (Re)carrega as imagens das molduras alinhadas por índice (via cache). */
  syncEls(): void {
    loadFrameEls(
      this.transform().frameImages,
      this.cache,
      () => this.transform().frameImages,
      (els) => this.imageEls.set(els),
    );
  }

  /** Seleciona a moldura ativa (alvo dos gestos na prévia). */
  select(index: number): void {
    this.activeIndex.set(index);
  }

  /**
   * EMPILHA uma moldura pré-cadastrada (até 3); vira a ativa. Entra já no
   * ENQUADRAMENTO PADRÃO do template (offset em fração × lado do editor; lado 0
   * = desconhecido → offset 0/COVER).
   */
  addTemplate(tpl: FrameTemplate): void {
    if (!tpl.thumbUrl || !this.canAdd()) {
      return;
    }
    const s = this.getEditorSide();
    const d = tpl.defaultFraming;
    this.add({
      path: tpl.storagePath,
      url: tpl.thumbUrl,
      source: 'template',
      id: tpl.id,
      offset: { x: d.offset.x * s, y: d.offset.y * s },
      scale: d.scale,
      rotation: d.rotation,
    });
  }

  /**
   * EMPILHA uma camada NEUTRA (offset 0 / scale 1 / rot 0), SEM aplicar o
   * enquadramento padrão da origem. `offset/scale/rotation` opcionais permitem
   * restaurar uma camada salva (já denormalizada pelo chamador).
   */
  addNeutral(ref: {
    path: string;
    url: string;
    source: 'upload' | 'template';
    id?: string;
    offset?: { x: number; y: number };
    scale?: number;
    rotation?: number;
  }): void {
    if (!this.canAdd()) {
      this.error.set(`Limite de ${this.max} molduras atingido.`);
      return;
    }
    this.add(ref);
  }

  /** Sobe o PNG e EMPILHA como nova moldura (até 3); vira a ativa. */
  async addUpload(file: File): Promise<void> {
    if (!this.canAdd()) {
      this.error.set(`Limite de ${this.max} molduras atingido.`);
      return;
    }
    this.error.set(null);
    this.uploading.set(true);
    try {
      // O downscale interno preserva o alfa do PNG (mesma fonte do fundo).
      this.add(await uploadLayerImage(file, this.uploads));
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Falha ao enviar a moldura.',
      );
    } finally {
      this.uploading.set(false);
    }
  }

  /** Recusa de arquivo pela dropzone (formato/tamanho). */
  reject(reason: string): void {
    this.error.set(reason);
  }

  /** Abre o painel "Remover fundo" para a moldura do índice (e a seleciona). */
  startBgEdit(index: number): void {
    this.error.set(null);
    this.activeIndex.set(index);
    this.bgEditIndex.set(index);
  }

  /** Fecha o painel "Remover fundo" sem alterar a moldura. */
  cancelBgEdit(): void {
    this.bgEditIndex.set(-1);
  }

  /**
   * Aplica o recorte: sobe o PNG sem fundo e TROCA a imagem da moldura em edição,
   * preservando enquadramento e z-order. Fecha o painel ao concluir.
   */
  async applyBgEdit(file: File): Promise<void> {
    const index = this.bgEditIndex();
    if (index < 0) {
      return;
    }
    this.error.set(null);
    this.uploading.set(true);
    try {
      const ref = await uploadLayerImage(file, this.uploads);
      this.transform.update((t) => replaceFrameImageAt(t, index, ref));
      this.bgEditIndex.set(-1);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Falha ao aplicar o recorte na moldura.',
      );
    } finally {
      this.uploading.set(false);
    }
  }

  /** Remove a moldura do índice; reajusta a ativa. */
  removeAt(index: number): void {
    this.error.set(null);
    this.bgEditIndex.set(-1);
    this.transform.update((t) => removeFrameImageAt(t, index));
    const len = this.transform().frameImages.length;
    this.activeIndex.update((a) => activeAfterRemove(a, index, len));
  }

  /** Sobe a moldura na pilha (mais ao TOPO); a ativa segue. */
  moveUp(index: number): void {
    if (index < this.transform().frameImages.length - 1) {
      this.reorder(index, index + 1);
    }
  }

  /** Desce a moldura na pilha (mais ao FUNDO); a ativa segue. */
  moveDown(index: number): void {
    if (index > 0) {
      this.reorder(index, index - 1);
    }
  }

  /** Gesto na prévia moveu/escalou/girou a moldura ATIVA → persiste no transform. */
  applyFraming(e: { index: number; framing: Framing }): void {
    this.transform.update((t) => updateFrameFramingAt(t, e.index, e.framing));
  }

  /** Redefine o enquadramento da moldura ATIVA (COVER: centrada, 1×, 0°). */
  resetActive(): void {
    this.resetAt(this.activeIndex());
  }

  /** Redefine o enquadramento da moldura do índice (COVER: centrada, 1×, 0°). */
  resetAt(index: number): void {
    if (index >= 0) {
      this.transform.update((t) =>
        updateFrameFramingAt(t, index, DEFAULT_BACKGROUND_FRAMING),
      );
    }
  }

  private add(ref: {
    path: string;
    url: string;
    source: 'upload' | 'template';
    id?: string;
    offset?: { x: number; y: number };
    scale?: number;
    rotation?: number;
  }): void {
    this.error.set(null);
    this.transform.update((t) => addFrameImage(t, ref, this.max));
    this.activeIndex.set(this.transform().frameImages.length - 1);
  }

  private reorder(from: number, to: number): void {
    this.bgEditIndex.set(-1);
    this.transform.update((t) => reorderFrame(t, from, to));
    this.activeIndex.update((a) => activeAfterReorder(a, from, to));
  }
}
