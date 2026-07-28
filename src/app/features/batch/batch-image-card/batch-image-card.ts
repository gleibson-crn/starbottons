import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DownloadButton, ResolutionBadge } from '../../../shared/ui';
import {
  BOTTON_SIZES,
  deriveItemStatus,
  hasReadyArt,
  worstSelectedDpi,
  artFileName,
  isNameValid,
  type BatchItem,
  type BottonSize,
} from '../../../core/batch';
import {
  BatchEditorDialog,
  type BatchEditResult,
} from '../batch-editor-dialog/batch-editor-dialog';
import { SizeMultiSelect } from '../size-multi-select/size-multi-select';

/** Uma arte pronta com suas URLs e nomes de arquivo. */
interface ReadyDownload {
  readonly size: BottonSize;
  readonly pngUrl: string | null;
  readonly pdfUrl: string | null;
  readonly pngName: string;
  readonly pdfName: string;
}

/** Uma arte que falhou: qual tamanho + mensagem amigável + detalhe técnico. */
interface ArtFailure {
  readonly size: BottonSize;
  readonly summary: string;
  readonly detail: string | null;
}

/** Detalhe técnico só quando acrescenta algo além da mensagem amigável. */
function failureDetail(raw: string | null): string | null {
  const text = (raw ?? '').trim();
  return text.length > 0 ? text : null;
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
  /** Pedido de abrir o Mockup Contextual desta imagem (grid → /app/mockup/:id). */
  readonly applyScene = output<void>();

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
  /** Habilita "Aplicar em cenário": exige ≥1 arte pronta nesta imagem. */
  readonly canApplyScene = computed(() => hasReadyArt(this.item()));

  readonly downloads = computed<ReadyDownload[]>(() => {
    const item = this.item();
    return BOTTON_SIZES.filter(
      (s) => item.selectedSizes.has(s) && item.arts[s]?.status === 'ready',
    ).map((size) => this.toDownload(item, size));
  });

  readonly failures = computed<ArtFailure[]>(() => {
    const item = this.item();
    return BOTTON_SIZES.filter(
      (s) => item.selectedSizes.has(s) && item.arts[s]?.status === 'failed',
    ).map((size) => ({
      size,
      summary: `${size} mm: falha ao gerar. Tente novamente.`,
      detail: failureDetail(item.arts[size]?.errorMessage ?? null),
    }));
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
