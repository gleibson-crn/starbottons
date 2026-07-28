import { BOTTON_SIZES, type BatchItem, type BottonSize } from '../../core/batch';

/**
 * Uma arte PRONTA do lote (item × tamanho) elegível para impressão. `key`
 * identifica a combinação de forma estável (mesma arte não duplica na folha).
 */
export interface ReadyArt {
  readonly key: string;
  readonly itemId: string;
  readonly name: string;
  readonly sizeMm: BottonSize;
  readonly url: string;
}

/**
 * Coleta as artes prontas do lote em ordem canônica (item → tamanho crescente):
 * inclui só os tamanhos SELECIONADOS com `status === 'ready'` e `printPngUrl`.
 * Função pura, testável sem Angular.
 */
export function collectReadyArts(items: readonly BatchItem[]): ReadyArt[] {
  const out: ReadyArt[] = [];
  for (const item of items) {
    for (const size of BOTTON_SIZES) {
      const art = item.arts[size];
      if (item.selectedSizes.has(size) && art?.status === 'ready' && art.printPngUrl) {
        out.push({
          key: `${item.id}:${size}`,
          itemId: item.id,
          name: item.name,
          sizeMm: size,
          url: art.printPngUrl,
        });
      }
    }
  }
  return out;
}
