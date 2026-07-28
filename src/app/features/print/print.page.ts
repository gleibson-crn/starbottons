import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BatchStore } from '../../core/batch';
import { packSheet, type PackedSheet, type PlacedPiece } from '../../core/print';
import { collectReadyArts, type ReadyArt } from './ready-arts';

/** Uma linha da folha em montagem: uma arte pronta com sua quantidade. */
interface SheetLine {
  readonly key: string;
  readonly url: string;
  readonly name: string;
  readonly sizeMm: ReadyArt['sizeMm'];
  readonly quantity: number;
}

const MIN_QTY = 1;
const MAX_QTY = 999;

/** Limita a quantidade ao intervalo válido (1..999); NaN vira o mínimo. */
function clampQty(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_QTY;
  }
  return Math.min(MAX_QTY, Math.max(MIN_QTY, Math.floor(value)));
}

/**
 * PrintPage — "Área de Impressão" (Estágio 1). Lista as artes JÁ geradas no lote
 * (BatchStore), deixa o usuário escolher quantidades e monta uma folha A4
 * otimizada (tamanhos mistos) via `packSheet`. Imprime direto da tela com
 * `window.print()` (o diálogo do navegador também salva em PDF). Sem upload
 * avulso (Estágio 2). Zoneless/OnPush: todo estado é signal/computed.
 */
@Component({
  selector: 'app-print-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './print.page.html',
  styleUrl: './print.page.scss',
})
export class PrintPage {
  private readonly store = inject(BatchStore);

  /** Artes prontas disponíveis no lote (reativas ao BatchStore). */
  readonly readyArts = computed(() => collectReadyArts(this.store.items()));

  /** Quantidade "de rascunho" por arte, antes de adicionar à folha. */
  private readonly draftQty = signal<Record<string, number>>({});

  /** Linhas já adicionadas à folha. */
  readonly lines = signal<SheetLine[]>([]);

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

  /** Adiciona a arte à folha (soma à quantidade se já presente). */
  addToSheet(art: ReadyArt): void {
    const qty = this.qtyFor(art.key);
    this.lines.update((lines) => this.mergeLine(lines, art, qty));
    this.draftQty.update((map) => ({ ...map, [art.key]: MIN_QTY }));
  }

  /** Redefine a quantidade de uma linha já adicionada. */
  setLineQty(key: string, event: Event): void {
    const qty = clampQty((event.target as HTMLInputElement).valueAsNumber);
    this.lines.update((lines) =>
      lines.map((l) => (l.key === key ? { ...l, quantity: qty } : l)),
    );
  }

  /** Remove uma linha da folha. */
  removeLine(key: string): void {
    this.lines.update((lines) => lines.filter((l) => l.key !== key));
  }

  /** Texto alternativo de uma peça posicionada na folha. */
  pieceAlt(piece: PlacedPiece): string {
    return `Arte de botton redondo de ${piece.sizeMm} mm`;
  }

  /** Abre o diálogo de impressão do navegador (imprime ou salva em PDF). */
  print(): void {
    window.print();
  }

  private mergeLine(lines: SheetLine[], art: ReadyArt, qty: number): SheetLine[] {
    if (lines.some((l) => l.key === art.key)) {
      return lines.map((l) =>
        l.key === art.key ? { ...l, quantity: clampQty(l.quantity + qty) } : l,
      );
    }
    return [
      ...lines,
      { key: art.key, url: art.url, name: art.name, sizeMm: art.sizeMm, quantity: qty },
    ];
  }
}
