import { computed, Injectable, signal } from '@angular/core';
import type {
  EditorTransform,
  GenerationResult,
  PrintSpec,
  UploadRecord,
} from '../../shared/types';
import { DEFAULT_TRANSFORM } from '../../shared/types';

/**
 * Estado do fluxo Upload → Modelo & Tamanho → Ajuste → Resultado.
 *
 * Vive em `root` para sobreviver às trocas de rota da SPA, preservando o
 * enquadramento ao "Ajustar novamente" sem re-upload. Todos os campos têm
 * default seguro (nulos / transform neutro).
 */
@Injectable({ providedIn: 'root' })
export class WorkflowStore {
  readonly upload = signal<UploadRecord | null>(null);
  readonly model = signal<string>('round');
  readonly sizeMm = signal<number | null>(null);
  readonly spec = signal<PrintSpec | null>(null);
  readonly transform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  /** Lado (px) do canvas do editor — base para normalizar o offset em mm. */
  readonly editorSide = signal<number>(520);
  readonly result = signal<GenerationResult | null>(null);

  /** `true` quando há imagem enviada (pré-requisito da seleção). */
  readonly hasUpload = computed(() => this.upload() !== null);

  /** `true` quando modelo, tamanho e spec estão prontos para o editor. */
  readonly hasSelection = computed(
    () => this.sizeMm() !== null && this.spec() !== null,
  );

  setUpload(record: UploadRecord): void {
    this.upload.set(record);
  }

  setSelection(sizeMm: number, spec: PrintSpec): void {
    this.sizeMm.set(sizeMm);
    this.spec.set(spec);
  }

  setTransform(transform: EditorTransform, editorSide?: number): void {
    this.transform.set(transform);
    if (editorSide) {
      this.editorSide.set(editorSide);
    }
  }

  setResult(result: GenerationResult): void {
    this.result.set(result);
  }

  /** Zera tudo (ação "Novo botton"). */
  reset(): void {
    this.revokePreview();
    this.upload.set(null);
    this.sizeMm.set(null);
    this.spec.set(null);
    this.transform.set(DEFAULT_TRANSFORM);
    this.result.set(null);
  }

  private revokePreview(): void {
    const current = this.upload();
    if (current?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(current.previewUrl);
    }
  }
}
