import type { ImageFilters, StyleEffect } from '../../shared/types';
import { DEFAULT_STYLE_EFFECT, filterString, isDefaultStyle } from '../../shared/types';
import { runStylePass, type PreparedArt } from '../../shared/imaging';

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
 * Teto do LADO MAIOR do PNG tratado enviado à Edge. O maior alvo de impressão é
 * 58mm → arte 70mm @300 DPI = 827px; 1280 dá ~1,5× de folga e mantém a
 * decodificação leve na Edge. CRÍTICO (dois motivos): (1) sem teto, uma foto
 * grande (ex.: 4000×6000 = 24MP) subia tratada em resolução natural e o
 * `decodeImage` (ImageScript) estourava o CPU hard limit do worker → HTTP 546;
 * (2) estilos de ALTA FREQUÊNCIA (halftone/contorno) baked bem acima do alvo
 * ficam ESCUROS/embolados quando a Edge reduz 2048→827 (os pontos se fundem) —
 * baked perto do alvo (1280→827, downscale suave) mantém o meio-tom limpo.
 * Efeitos de cor chapada (pôster/pop) toleram o downscale igualmente. O upload
 * ORIGINAL segue full-res (badge de DPI e mockup usam a fonte original); só o
 * TRATADO é limitado.
 */
export const TREATED_MAX_SIDE = 1280;

/**
 * Renderiza a imagem de origem com `ctx.filter = filterString(f)` e devolve um
 * PNG lossless, limitando o LADO MAIOR a `TREATED_MAX_SIDE` (ver constante).
 * Usa as MESMAS regras de filtro do preview (Abordagem A do ADR-014): o
 * resultado é um novo arquivo, sem tocar a Edge Function.
 *
 * Quando `style` NÃO é `none` (ADR-019), o estágio "style pass" é aplicado pela
 * MESMA `runStylePass`/`prepareArt` do preview/mockup (paridade por
 * construção), preferindo o Web Worker; sem estilo, só o caminho tonal roda.
 */
export async function renderFilteredBlob(
  image: CanvasImageSource & FilterSource,
  filters: ImageFilters,
  createCanvas: CanvasFactory = defaultCanvasFactory,
  style: StyleEffect = DEFAULT_STYLE_EFFECT,
): Promise<Blob> {
  const longer = Math.min(
    TREATED_MAX_SIDE,
    Math.max(image.naturalWidth, image.naturalHeight),
  );
  if (!isDefaultStyle(style)) {
    return renderStyledBlob(image, filters, style, longer, createCanvas);
  }
  const scale = longer / Math.max(image.naturalWidth, image.naturalHeight);
  const canvas = createCanvas();
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível para aplicar filtros.');
  }
  ctx.filter = filterString(filters);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToPngBlob(canvas);
}

/** Bake do style pass (tonal + estilo) via worker/prepareArt, no lado dado. */
async function renderStyledBlob(
  image: CanvasImageSource & FilterSource,
  filters: ImageFilters,
  style: StyleEffect,
  longer: number,
  createCanvas: CanvasFactory,
): Promise<Blob> {
  const canvas = await runStylePass(
    image as unknown as PreparedArt,
    filters,
    style,
    longer,
    createCanvas,
  );
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
