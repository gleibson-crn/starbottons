import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  type OnDestroy,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  MIN_QTY,
  PrintStore,
  clampQty,
  packSheet,
  type BottonSize,
  type PackedSheet,
  type PlacedPiece,
} from '../../core/print';
import { SIZE_OPTIONS } from '../../shared/utils';
import { FileDropzone } from '../../shared/ui';
import { buildAvulsoLine } from './avulso-art';
import { localBackend } from '../../core/local-backend/local-api';

/**
 * PrintPage — "Área de Impressão". Monta uma folha A4 otimizada (`packSheet`) a
 * partir da FILA da `PrintStore`: começa VAZIA (abrir pelo menu mostra a folha
 * em branco) e recebe artes do lote só pelo botão "Levar para impressão" do
 * cartão (via `enqueue`). Também aceita imagens AVULSAS enviadas aqui (upload →
 * arte redonda no mesmo estilo, via `buildAvulsoLine`), que entram na mesma
 * fila. Imprime direto da tela com `window.print()`. Zoneless/OnPush: todo
 * estado é signal/computed. Os object URLs das linhas pertencem à store (é ela
 * que os revoga em remover/limpar, pois a fila sobrevive à página); aqui só o
 * object URL da PRÉVIA do arquivo avulso pendente é revogado no `ngOnDestroy`.
 */
@Component({
  selector: 'app-print-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FileDropzone],
  templateUrl: './print.page.html',
  styleUrl: './print.page.scss',
})
export class PrintPage implements OnDestroy {
  private readonly printStore = inject(PrintStore);

  /** Linhas da folha (fonte única: a fila da PrintStore). */
  readonly lines = this.printStore.queue;

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

  /** Folha atualmente em foco na prévia (1-based) — dirige o pager flutuante. */
  readonly currentPage = signal(1);
  /** Contêiner rolável da prévia (root do IntersectionObserver). */
  private readonly previewScroll = viewChild<ElementRef<HTMLElement>>('previewScroll');
  /** Molduras de cada folha (para observar visibilidade e navegar). */
  private readonly sheetFrames = viewChildren<ElementRef<HTMLElement>>('sheetFrame');
  private observer?: IntersectionObserver;

  constructor() {
    // Observa qual folha está mais visível na prévia rolável e reflete no
    // `currentPage`. Reconfigura quando as molduras mudam (nº de páginas varia).
    effect((onCleanup) => {
      const frames = this.sheetFrames().map((r) => r.nativeElement);
      const root = this.previewScroll()?.nativeElement;
      this.observer?.disconnect();
      if (!frames.length || !root || typeof IntersectionObserver === 'undefined') {
        return;
      }
      const ratios = new Map<Element, number>();
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            ratios.set(e.target, e.intersectionRatio);
          }
          let best = -1;
          let bestIdx = 0;
          frames.forEach((f, i) => {
            const r = ratios.get(f) ?? 0;
            if (r > best) {
              best = r;
              bestIdx = i;
            }
          });
          this.currentPage.set(bestIdx + 1);
        },
        { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      frames.forEach((f) => this.observer!.observe(f));
      onCleanup(() => this.observer?.disconnect());
    });
  }

  /** Rola a prévia até a folha `page` (1-based), deixando ver a anterior. */
  goToPage(page: number): void {
    const n = Math.min(this.pageCount(), Math.max(1, page));
    this.sheetFrames()[n - 1]?.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    this.currentPage.set(n);
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

  /** Renderiza a arte avulsa pendente e a enfileira na folha. */
  async addAvulsoToSheet(): Promise<void> {
    const file = this.pendingFile();
    if (!file) {
      return;
    }
    try {
      const line = await buildAvulsoLine(file, this.avulsoSize(), this.avulsoQty());
      this.printStore.enqueue(line);
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

  /** Redefine a quantidade de uma linha já na folha. */
  setLineQty(key: string, event: Event): void {
    this.printStore.setQuantity(key, (event.target as HTMLInputElement).valueAsNumber);
  }

  /** Remove uma linha da folha (a store revoga seu object URL). */
  removeLine(key: string): void {
    this.printStore.remove(key);
  }

  /** Texto alternativo de uma peça posicionada na folha. */
  pieceAlt(piece: PlacedPiece): string {
    return `Arte de botton redondo de ${piece.sizeMm} mm`;
  }

  /**
   * Imprime a folha. No Electron (`window.sb`), abre o diálogo da IMPRESSORA do
   * sistema e envia direto ao papel (quem quiser PDF escolhe "Print to PDF" no
   * diálogo). No navegador, usa o diálogo de impressão normal. Se o caminho do
   * Electron falhar (ex.: sem impressora), cai no `window.print()`.
   */
  print(): void {
    const local = localBackend();
    if (local) {
      local
        .printSheet()
        .then((r) => {
          if (!r.ok) {
            window.print();
          }
        })
        .catch(() => window.print());
      return;
    }
    window.print();
  }

  /** Revoga só a prévia pendente (as linhas pertencem à store persistente). */
  ngOnDestroy(): void {
    this.revokePreview();
  }
}
