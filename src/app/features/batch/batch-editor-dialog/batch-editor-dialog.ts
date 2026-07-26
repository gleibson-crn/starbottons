import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { EditorTransform, PrintSpec } from '../../../shared/types';
import { DEFAULT_TRANSFORM } from '../../../shared/types';
import { CanvasEditor, ResolutionBadge } from '../../../shared/ui';
import { effectiveDpi, fallbackSpec, loadImage } from '../../../shared/utils';
import { largestSelectedSize, type BatchItem } from '../../../core/batch';

/** Ajuste salvo pelo diálogo (vale p/ todos os tamanhos da imagem). */
export interface BatchEditResult {
  readonly transform: EditorTransform;
  readonly editorSide: number;
}

/**
 * BatchEditorDialog — modal de enquadramento de UMA imagem do lote. Usa o
 * CanvasEditor (shared/ui) com a spec do MAIOR tamanho selecionado (a arte mais
 * exigente). Acessibilidade: `role="dialog"` + `aria-modal`, Esc fecha, foco
 * inicial no canvas; o ajuste salvo aplica-se a todos os tamanhos da imagem.
 */
@Component({
  selector: 'app-batch-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasEditor, ResolutionBadge],
  host: { '(keydown)': 'onKeydown($event)' },
  templateUrl: './batch-editor-dialog.html',
  styleUrl: './batch-editor-dialog.scss',
})
export class BatchEditorDialog implements OnInit {
  readonly item = input.required<BatchItem>();
  readonly saved = output<BatchEditResult>();
  readonly closed = output<void>();

  readonly image = signal<HTMLImageElement | null>(null);
  readonly transform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  private readonly canvas = viewChild(CanvasEditor);

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
    this.transform.set(this.item().transform);
    void this.hydrate();
  }

  onSave(): void {
    this.saved.emit({
      transform: this.transform(),
      editorSide: this.canvas()?.side() ?? this.item().editorSide,
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

  private async hydrate(): Promise<void> {
    this.image.set(await loadImage(this.item().previewUrl));
  }
}
