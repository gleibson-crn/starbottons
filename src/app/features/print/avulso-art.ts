import type { BottonSize } from '../../core/print';
import { DEFAULT_TRANSFORM } from '../../shared/types';
import { drawBottonFace } from '../../shared/ui/canvas-editor/botton-face';
import { DEFAULT_DPI, fallbackSpec, loadImage, mmToPx } from '../../shared/utils';
import type { EditorLayout } from '../../shared/utils';
import { clampQty, type SheetLine } from './sheet-line';

/** Cor da linha de corte — idêntica à arte da Edge (`svg.ts`). */
const CUT_STROKE = '#111827';
/** Fundo branco (cantos do quadrado + área do círculo). */
const PAPER = '#ffffff';

/**
 * Layout de face em que a arte ocupa o CÍRCULO INTEIRO do quadrado (raio =
 * metade do lado): a imagem avulsa cobre toda a arte, como a composta da Edge.
 */
function fullCircleLayout(artPx: number): EditorLayout {
  const r = artPx / 2;
  return { center: r, pxPerMm: 1, bleedR: r, cutR: r, safeR: r };
}

/**
 * Linha de corte: circunferência tracejada escura no diâmetro da arte, recuada
 * meia-espessura p/ dentro (não é cortada pela borda do PNG). Espelha a
 * `cutLine` da Edge (`stroke #111827`, dasharray `w*4 w*3`).
 */
function drawCutLine(ctx: CanvasRenderingContext2D, artPx: number): void {
  const c = artPx / 2;
  const w = Math.max(1, Math.round(artPx * 0.004));
  ctx.save();
  ctx.strokeStyle = CUT_STROKE;
  ctx.lineWidth = w;
  ctx.setLineDash([w * 4, w * 3]);
  ctx.beginPath();
  ctx.arc(c, c, c - w / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Converte o canvas em object URL de PNG (rejeita se `toBlob` falhar). */
function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(URL.createObjectURL(blob))
          : reject(new Error('Falha ao gerar a arte avulsa.')),
      'image/png',
    );
  });
}

/**
 * Renderiza uma imagem avulsa como arte QUADRADA de impressão, no MESMO estilo
 * das artes do lote (Edge `svg.ts`): papel BRANCO no quadrado inteiro (cantos
 * brancos, sem xadrez), imagem em COVER recortada ao CÍRCULO da arte e linha de
 * corte tracejada no diâmetro. Lado = `mmToPx(artDiameterMm, 300)` (32→520,
 * 44→638, 58→827 px). Devolve um object URL (PNG) — lembre de revogá-lo.
 */
export async function renderAvulsoArt(
  image: HTMLImageElement,
  sizeMm: BottonSize,
): Promise<string> {
  const spec = fallbackSpec('round', sizeMm);
  if (!spec) {
    throw new Error(`Sem print_spec de fallback para ${sizeMm}mm.`);
  }
  const artPx = mmToPx(spec.artDiameterMm, DEFAULT_DPI);
  const canvas = document.createElement('canvas');
  canvas.width = artPx;
  canvas.height = artPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível.');
  }
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, artPx, artPx);
  const layout = fullCircleLayout(artPx);
  ctx.save();
  ctx.beginPath();
  ctx.arc(layout.center, layout.center, layout.bleedR, 0, Math.PI * 2);
  ctx.clip();
  drawBottonFace({ ctx, side: artPx, layout, image, transform: DEFAULT_TRANSFORM });
  ctx.restore();
  drawCutLine(ctx, artPx);
  return canvasToObjectUrl(canvas);
}

/**
 * Fluxo completo do upload avulso → linha da folha: carrega o arquivo (object
 * URL), renderiza a arte avulsa e devolve a `SheetLine` (`origin: 'avulso'`). O
 * object URL do ARQUIVO é revogado assim que a imagem é usada; o da ARTE viaja
 * na linha e deve ser revogado ao remover/destruir.
 */
export async function buildAvulsoLine(
  file: File,
  sizeMm: BottonSize,
  quantity: number,
): Promise<SheetLine> {
  const fileUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(fileUrl);
    const url = await renderAvulsoArt(image, sizeMm);
    return {
      key: `avulso:${crypto.randomUUID()}`,
      url,
      name: file.name,
      sizeMm,
      quantity: clampQty(quantity),
      origin: 'avulso',
    };
  } finally {
    URL.revokeObjectURL(fileUrl);
  }
}
