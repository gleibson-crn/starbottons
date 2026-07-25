import type { EditorTransform, PrintSpec } from '../../shared/types';
import { computeLayout, imageDrawSize } from '../../shared/utils';

/** Parâmetros para compor o mockup (face visível) de um botton. */
export interface MockupParams {
  readonly image: HTMLImageElement;
  readonly transform: EditorTransform;
  readonly spec: PrintSpec;
  /** Lado do canvas (deve ser o mesmo do editor p/ os offsets baterem). */
  readonly side: number;
}

/**
 * Compõe a face circular enquadrada + brilho/sombra simples, devolvendo um
 * canvas pronto para preview ou export (`mockup_png`).
 */
export function renderMockup(p: MockupParams): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = p.side;
  canvas.height = p.side;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível.');
  }
  const layout = computeLayout(p.spec, p.side);
  drawFace(ctx, p, layout.center, layout.cutR);
  applyGloss(ctx, layout.center, layout.cutR);
  return canvas;
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  p: MockupParams,
  center: number,
  cutR: number,
): void {
  const bleedDiameter = computeLayout(p.spec, p.side).bleedR * 2;
  const { drawW, drawH } = imageDrawSize(
    p.image.naturalWidth,
    p.image.naturalHeight,
    bleedDiameter,
    p.transform.scale,
  );
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, cutR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = p.transform.background;
  ctx.fillRect(0, 0, p.side, p.side);
  ctx.translate(center + p.transform.offset.x, center + p.transform.offset.y);
  ctx.rotate((p.transform.rotation * Math.PI) / 180);
  ctx.drawImage(p.image, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

/** Brilho superior-esquerdo + sombra inferior, para aparência de pin/botton. */
function applyGloss(
  ctx: CanvasRenderingContext2D,
  center: number,
  cutR: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, cutR, 0, Math.PI * 2);
  ctx.clip();
  const hi = ctx.createRadialGradient(
    center - cutR * 0.4, center - cutR * 0.4, cutR * 0.1,
    center, center, cutR * 1.2,
  );
  hi.addColorStop(0, 'hsl(0 0% 100% / 45%)');
  hi.addColorStop(0.5, 'hsl(0 0% 100% / 0%)');
  hi.addColorStop(1, 'hsl(240 40% 6% / 40%)');
  ctx.fillStyle = hi;
  ctx.fillRect(center - cutR, center - cutR, cutR * 2, cutR * 2);
  ctx.restore();
}

/** Converte o canvas do mockup em blob PNG (para download client-side). */
export function mockupToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha no mockup.'))),
      'image/png',
    );
  });
}
