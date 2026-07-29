import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BatchStore } from '../../core/batch';
import { packSheet, type BottonSize, type PackedSheet, type PlacedPiece } from '../../core/print';
import { SIZE_OPTIONS } from '../../shared/utils';
import { FileDropzone } from '../../shared/ui';
import { buildAvulsoLine } from './avulso-art';
import { collectReadyArts, type ReadyArt } from './ready-arts';
import { MIN_QTY, clampQty, mergeReadyLine, type SheetLine } from './sheet-line';

/**
 * PrintPage — "Área de Impressão" (Estágio 2). Monta uma folha A4 otimizada
 * (`packSheet`) a partir de DUAS fontes: as artes JÁ geradas no lote
 * (BatchStore) e imagens AVULSAS enviadas aqui (upload → arte redonda no mesmo
 * estilo, via `buildAvulsoLine`). Imprime direto da tela com `window.print()`.
 * Zoneless/OnPush: todo estado é signal/computed. Object URLs de artes avulsas
 * são revogados ao remover a linha e no `ngOnDestroy`.
 */
@Component({
  selector: 'app-print-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FileDropzone],
  templateUrl: './print.page.html',
  styleUrl: './print.page.scss',
})
export class PrintPage implements OnDestroy {
  private readonly store = inject(BatchStore);

  /** Artes prontas disponíveis no lote (reativas ao BatchStore). */
  readonly readyArts = computed(() => collectReadyArts(this.store.items()));

  /** Quantidade "de rascunho" por arte, antes de adicionar à folha. */
  private readonly draftQty = signal<Record<string, number>>({});

  /** Linhas já adicionadas à folha (artes do lote e/ou avulsas). */
  readonly lines = signal<SheetLine[]>([]);

  /** Opções de tamanho para a arte avulsa (32/44/58 mm). */
  readonly sizeOptions = SIZE_OPTIONS;
  /** Tamanho escolhido para a próxima imagem avulsa. */
  readonly avulsoSize = signal<BottonSize>(32);
  /** Quantidade escolhida para a próxima imagem avulsa. */
  readonly avulsoQty = signal<number>(MIN_QTY);
  /** Erro do fluxo avulso (formato/leitura/render), anunciado via aria-live. */
  readonly avulsoError = signal<string | null>(null);
  /** Arquivo aceito aguardando ser adicionado à folha. */
  readonly pendingFile = signal<File | null>(null);
  /** Object URL do arquivo pendente, só para a miniatura de prévia. */
  readonly pendingPreview = signal<string | null>(null);
  readonly hasPending = computed(() => this.pendingFile() !== null);

  /** Folha(s) A4 empacotadas a partir das linhas atuais. */
  readonly packed = computed<PackedSheet>(() =>
    packSheet(
      this.lines().map((l) => ({
        id: l.key,
        url: l.url,
        sizeMm: l.sizeMm,
        quantity: l.quantity,
      })),
    ),
  );

  readonly pageCount = computed(() => this.packed().pages.length);
  readonly hasSheet = computed(() => this.packed().totalPieces > 0);

  /** Quantidade de rascunho corrente de uma arte (default 1). */
  qtyFor(key: string): number {
    return this.draftQty()[key] ?? MIN_QTY;
  }

  /** Atualiza o rascunho a partir do `<input type="number">`. */
  onDraftInput(key: string, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.draftQty.update((map) => ({ ...map, [key]: clampQty(value) }));
  }

  /** Adiciona a arte do lote à folha (soma à quantidade se já presente). */
  addToSheet(art: ReadyArt): void {
    const qty = this.qtyFor(art.key);
    this.lines.update((lines) => mergeReadyLine(lines, art, qty));
    this.draftQty.update((map) => ({ ...map, [art.key]: MIN_QTY }));
  }

  /** Define o tamanho da próxima arte avulsa a partir do `<select>`. */
  setAvulsoSize(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value) as BottonSize;
    this.avulsoSize.set(value);
  }

  /** Atualiza a quantidade da próxima arte avulsa. */
  onAvulsoQtyInput(event: Event): void {
    this.avulsoQty.set(clampQty((event.target as HTMLInputElement).valueAsNumber));
  }

  /** Recebe o arquivo validado do dropzone e o segura para prévia. */
  onAvulsoFile(file: File): void {
    this.avulsoError.set(null);
    this.revokePreview();
    this.pendingFile.set(file);
    this.pendingPreview.set(URL.createObjectURL(file));
  }

  /** Arquivo recusado pelo dropzone (formato/tamanho). */
  onAvulsoRejected(reason: string): void {
    this.avulsoError.set(reason);
  }

  /** Renderiza a arte avulsa pendente e a adiciona à folha. */
  async addAvulsoToSheet(): Promise<void> {
    const file = this.pendingFile();
    if (!file) {
      return;
    }
    try {
      const line = await buildAvulsoLine(file, this.avulsoSize(), this.avulsoQty());
      this.lines.update((lines) => [...lines, line]);
      this.clearPending();
      this.avulsoQty.set(MIN_QTY);
    } catch {
      this.avulsoError.set('Não foi possível preparar a imagem avulsa. Tente outra.');
    }
  }

  /** Revoga o object URL de prévia do arquivo pendente (se houver). */
  private revokePreview(): void {
    const url = this.pendingPreview();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }

  /** Descarta o arquivo pendente e sua prévia. */
  private clearPending(): void {
    this.revokePreview();
    this.pendingFile.set(null);
    this.pendingPreview.set(null);
  }

  /** Redefine a quantidade de uma linha já adicionada. */
  setLineQty(key: string, event: Event): void {
    const qty = clampQty((event.target as HTMLInputElement).valueAsNumber);
    this.lines.update((lines) =>
      lines.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
    );
  }

  /** Remove uma linha da folha (revoga o object URL se for arte avulsa). */
  removeLine(key: string): void {
    this.lines.update((lines) => {
      const target = lines.find((l) => l.key === key);
      if (target?.origin === 'avulso') {
        URL.revokeObjectURL(target.url);
      }
      return lines.filter((l) => l.key !== key);
    });
  }

  /** Texto alternativo de uma peça posicionada na folha. */
  pieceAlt(piece: PlacedPiece): string {
    return `Arte de botton redondo de ${piece.sizeMm} mm`;
  }

  /** Abre o diálogo de impressão do navegador (imprime ou salva em PDF). */
  print(): void {
    window.print();
  }

  /** Revoga os object URLs de artes avulsas na folha e a prévia pendente. */
  ngOnDestroy(): void {
    for (const line of this.lines()) {
      if (line.origin === 'avulso') {
        URL.revokeObjectURL(line.url);
      }
    }
    this.revokePreview();
  }
}
