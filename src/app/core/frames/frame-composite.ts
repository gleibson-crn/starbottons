import { InjectionToken } from '@angular/core';
import type { Framing } from '../../shared/types';
import { imageDrawSize } from '../../shared/utils';

/** Lado (px) do PNG achatado da moldura composta. */
export const COMPOSITE_SIDE = 1000;

/**
 * Rasteriza a pilha de camadas num PNG quadrado TRANSPARENTE (sem fundo, sem
 * clip circular). Cada camada: translate(centro + offset) → rotate → drawImage
 * em COVER no quadrado `side` × scale, na ordem do array (z-order) — a MESMA
 * geometria do `drawFrames` do botton (que cobre o círculo visível `cutR*2`).
 *
 * `framings[i].offset` está em FRAÇÃO do lado do editor. O PNG achatado depois
 * é aplicado em COVER no círculo visível (diâmetro `cutR*2 = editorSide *
 * diameterRatio`); por isso o offset em px do PNG é `fração * side / ratio`.
 * Com `diameterRatio = 1` (default) o offset é simplesmente `fração * side`.
 */
export function renderFramesComposite(
  imageEls: readonly (HTMLImageElement | null)[],
  framings: readonly Framing[],
  side = COMPOSITE_SIDE,
  diameterRatio = 1,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return Promise.reject(new Error('Canvas indisponível para gerar a moldura.'));
  }
  ctx.clearRect(0, 0, side, side);
  const k = side / (diameterRatio || 1);
  imageEls.forEach((img, i) => {
    if (img) {
      drawLayer(ctx, img, framings[i], side, k);
    }
  });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao gerar o PNG da moldura.'))),
      'image/png',
    );
  });
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  fr: Framing | undefined,
  side: number,
  k: number,
): void {
  const f = fr ?? { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 };
  const { drawW, drawH } = imageDrawSize(img.naturalWidth, img.naturalHeight, side, f.scale);
  ctx.save();
  ctx.translate(side / 2 + f.offset.x * k, side / 2 + f.offset.y * k);
  ctx.rotate((f.rotation * Math.PI) / 180);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

/** Seam de DI p/ a rasterização (permite stub nos testes; default = real). */
export const FRAME_RASTERIZER = new InjectionToken<typeof renderFramesComposite>(
  'FRAME_RASTERIZER',
  { providedIn: 'root', factory: () => renderFramesComposite },
);
