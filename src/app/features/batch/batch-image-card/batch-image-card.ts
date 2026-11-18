import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DownloadButton, ResolutionBadge, ToastService } from '../../../shared/ui';
import { GenerationService } from '../../../core/generation/generation.service';
import { PrintStore, toLocalUrl } from '../../../core/print';
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
  readonly jobId: string | null;
  readonly pngUrl: string | null;
  readonly pngName: string;
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
  private readonly printStore = inject(PrintStore);
  private readonly toast = inject(ToastService);
  private readonly generation = inject(GenerationService);

  readonly item = input.required<BatchItem>();
  readonly capped = input<boolean>(false);
  readonly busy = input<boolean>(false);
  /** Lote numerado: exibe o badge do nº (impresso só na sangria). */
  readonly numbered = input<boolean>(false);
  /** Número (senha) repetido em outro item do lote (aviso, não bloqueia). */
  readonly duplicate = input<boolean>(false);

  readonly sizeToggled = output<BottonSize>();
  readonly removed = output<void>();
  readonly nameChanged = output<string>();
  readonly seqChanged = output<string>();
  readonly transformChanged = output<BatchEditResult>();
  readonly retried = output<void>();
  /** Pedido de REENVIAR a imagem quando o UPLOAD falhou (reusa o File original). */
  readonly uploadRetried = output<void>();
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

  /** `true` quando TODAS as artes prontas deste item já estão na folha. */
  readonly inPrint = computed(() => {
    const dls = this.downloads();
    if (dls.length === 0) {
      return false;
    }
    const id = this.item().id;
    return dls.every((dl) => this.printStore.has(`${id}:${dl.size}`));
  });

  onName(event: Event): void {
    this.nameChanged.emit((event.target as HTMLInputElement).value);
  }

  onSeq(event: Event): void {
    this.seqChanged.emit((event.target as HTMLInputElement).value);
  }

  onSaved(result: BatchEditResult): void {
    this.transformChanged.emit(result);
    this.editing.set(false);
  }

  /**
   * "Levar para impressão": enfileira TODAS as artes prontas desta imagem na
   * PrintStore (uma linha por tamanho pronto) e navega para a folha. A signed
   * URL (cross-origin, expira) vira object URL de mesma origem via `toLocalUrl`
   * — a mesma conversão que a folha fazia — para imprimir de forma confiável.
   * Reenviar a mesma arte SOMA a quantidade (o merge é feito na store).
   */
  /** Motivo da última falha ao enfileirar (exibido no toast de erro). */
  private lastEnqueueError = '';

  /**
   * ADICIONA as artes prontas deste item à folha SEM navegar — o usuário junta
   * várias artes e vai à folha pelo botão global "Impressão (N)" do cabeçalho.
   * Feedback por toast; artes já na folha não são duplicadas.
   */
  async addToPrint(): Promise<void> {
    const item = this.item();
    this.lastEnqueueError = '';
    let enqueued = 0;
    for (const dl of this.downloads()) {
      if (await this.enqueueDownload(item.id, item.name, dl)) {
        enqueued++;
      }
    }
    if (enqueued > 0) {
      this.toast.success('Adicionado à folha de impressão.');
    } else {
      const why = this.lastEnqueueError || 'nenhuma arte pronta';
      this.toast.error(`Não foi possível adicionar à impressão: ${why}.`);
    }
  }

  /** Remove as artes deste item da folha de impressão. */
  removeFromPrint(): void {
    const id = this.item().id;
    for (const dl of this.downloads()) {
      this.printStore.remove(`${id}:${dl.size}`);
    }
  }

  /** Converte a arte pronta em object URL e a enfileira; `false` se falhar. */
  private async enqueueDownload(
    itemId: string,
    name: string,
    dl: ReadyDownload,
  ): Promise<boolean> {
    if (!dl.pngUrl) {
      this.lastEnqueueError = 'a arte não tem URL de impressão — gere novamente';
      return false;
    }
    const key = `${itemId}:${dl.size}`;
    if (this.printStore.has(key)) {
      return true; // já na folha — não duplica a quantidade
    }
    try {
      // URL FRESH (a guardada pode ter expirado); fallback na antiga.
      const fresh = await this.generation.freshPrintUrl(dl.jobId);
      const url = await toLocalUrl(fresh ?? dl.pngUrl);
      this.printStore.enqueue({
        key,
        url,
        name,
        sizeMm: dl.size,
        quantity: 1,
        origin: 'ready',
      });
      return true;
    } catch (err) {
      this.lastEnqueueError =
        err instanceof Error ? err.message : 'falha ao baixar a arte';
      return false;
    }
  }

  /** Provedor de URL fresh para o botão de download (re-assina no clique). */
  readonly refreshers = computed(() => {
    const map = new Map<BottonSize, () => Promise<string | null>>();
    for (const dl of this.downloads()) {
      map.set(dl.size, () => this.generation.freshPrintUrl(dl.jobId));
    }
    return map;
  });

  private toDownload(item: BatchItem, size: BottonSize): ReadyDownload {
    const art = item.arts[size];
    return {
      size,
      jobId: art?.jobId ?? null,
      pngUrl: art?.printPngUrl ?? null,
      pngName: artFileName(item.name, size, 'png'),
    };
  }
}
