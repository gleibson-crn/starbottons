import type { ImageFilters } from '../../shared/types';
import { filterString } from '../../shared/types';

/** Fonte com dimensões naturais (ex.: `HTMLImageElement`). */
export interface FilterSource {
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

/** Fábrica de canvas (injetável em testes). */
export type CanvasFactory = () => HTMLCanvasElement;

const defaultCanvasFactory: CanvasFactory = () =>
  document.createElement('canvas');

/**
 * Renderiza a imagem de origem em RESOLUÇÃO NATURAL (naturalWidth×naturalHeight)
 * com `ctx.filter = filterString(f)` e devolve um PNG lossless (preserva a
 * resolução para 300 DPI). Usa as MESMAS regras de filtro do preview (Abordagem
 * A do ADR-014): o resultado é um novo arquivo, sem tocar a Edge Function.
 */
export async function renderFilteredBlob(
  image: CanvasImageSource & FilterSource,
  filters: ImageFilters,
  createCanvas: CanvasFactory = defaultCanvasFactory,
): Promise<Blob> {
  const canvas = createCanvas();
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível para aplicar filtros.');
  }
  ctx.filter = filterString(filters);
  ctx.drawImage(image, 0, 0);
  return canvasToPngBlob(canvas);
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Falha ao gerar o PNG tratado.'));
      }
    }, 'image/png');
  });
}

/** Deriva o nome do arquivo tratado a partir do original. */
export function treatedFileName(sourceName: string): string {
  const dot = sourceName.lastIndexOf('.');
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  return `${base}-tratado.png`;
}
