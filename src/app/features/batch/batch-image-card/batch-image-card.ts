import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DownloadButton, ResolutionBadge } from '../../../shared/ui';
import { deriveItemStatus, worstSelectedDpi } from '../batch-gating';
import { artFileName } from '../batch-naming';
import { isNameValid } from '../batch-naming';
import {
  BatchEditorDialog,
  type BatchEditResult,
} from '../batch-editor-dialog/batch-editor-dialog';
import { SizeMultiSelect } from '../size-multi-select/size-multi-select';
import { BOTTON_SIZES, type BatchItem, type BottonSize } from '../batch.types';

/** Uma arte pronta com suas URLs e nomes de arquivo. */
interface ReadyDownload {
  readonly size: BottonSize;
  readonly pngUrl: string | null;
  readonly pdfUrl: string | null;
  readonly pngName: string;
  readonly pdfName: string;
}

/**
 * BatchImageCard — cartão de uma imagem do lote: nome (obrigatório), badge de
 * resolução (maior tamanho, denso), seleção de tamanhos com gating, ações e
 * downloads por arte pronta. A borda-acento comunica o status por classe +
 * texto (não só cor). Ver batch-image-card.html para a estrutura acessível.
 */
@Component({
  selector: 'app-batch-image-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResolutionBadge, DownloadButton, SizeMultiSelect, BatchEditorDialog],
  templateUrl: './batch-image-card.html',
  styleUrl: './batch-image-card.scss',
})
export class BatchImageCard {
  readonly item = input.required<BatchItem>();
  readonly capped = input<boolean>(false);
  readonly busy = input<boolean>(false);

  readonly sizeToggled = output<BottonSize>();
  readonly removed = output<void>();
  readonly nameChanged = output<string>();
  readonly transformChanged = output<BatchEditResult>();
  readonly retried = output<void>();

  readonly editing = signal(false);

  readonly status = computed(() => deriveItemStatus(this.item()));
  readonly hasSelection = computed(() => this.item().selectedSizes.size > 0);
  readonly badgeDpi = computed(() => worstSelectedDpi(this.item()));
  readonly nameInvalid = computed(
    () => this.hasSelection() && !isNameValid(this.item().name),
  );
  readonly canAdjust = computed(
    () => !!this.item().upload && this.hasSelection(),
  );
  readonly showRetry = computed(() =>
    ['failed', 'partial'].includes(this.status()),
  );

  readonly downloads = computed<ReadyDownload[]>(() => {
    const item = this.item();
    return BOTTON_SIZES.filter(
      (s) => item.selectedSizes.has(s) && item.arts[s]?.status === 'ready',
    ).map((size) => this.toDownload(item, size));
  });

  onName(event: Event): void {
    this.nameChanged.emit((event.target as HTMLInputElement).value);
  }

  onSaved(result: BatchEditResult): void {
    this.transformChanged.emit(result);
    this.editing.set(false);
  }

  private toDownload(item: BatchItem, size: BottonSize): ReadyDownload {
    const art = item.arts[size];
    return {
      size,
      pngUrl: art?.printPngUrl ?? null,
      pdfUrl: art?.printPdfUrl ?? null,
      pngName: artFileName(item.name, size, 'png'),
      pdfName: artFileName(item.name, size, 'pdf'),
    };
  }
}
