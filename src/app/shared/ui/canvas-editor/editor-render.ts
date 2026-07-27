import type { EditorTransform, ImageFilters } from '../../types';
import { filterString } from '../../types';
import type { EditorLayout } from '../../utils';

/** Parâmetros de uma cena completa do editor. */
export interface SceneParams {
  readonly ctx: CanvasRenderingContext2D;
  readonly side: number;
  readonly layout: EditorLayout;
  readonly image: HTMLImageElement | null;
  readonly transform: EditorTransform;
  readonly drawW: number;
  readonly drawH: number;
  /** Filtros aplicados APENAS à imagem (opcional; ausência = sem filtro). */
  readonly filters?: ImageFilters;
  /**
   * Imagem de fundo já carregada. Desenhada em COVER fixo preenchendo o círculo
   * (sem o transform do usuário), por cima da cor e por baixo da arte.
   */
  readonly backgroundImage?: HTMLImageElement | null;
}

/** Desenha a cena inteira: fundo, imagem, escurecimento e guias. */
export function drawScene(p: SceneParams): void {
  const { ctx, side, layout } = p;
  ctx.clearRect(0, 0, side, side);
  drawImageLayer(p);
  drawDarkenOutsideCut(ctx, layout, side);
  drawGuides(ctx, layout);
}

function drawImageLayer(p: SceneParams): void {
  const { ctx, layout, image, transform, drawW, drawH } = p;
  ctx.save();
  circlePath(ctx, layout.center, layout.bleedR);
  ctx.clip();
  // O fundo neutro (modo quieto) NÃO recebe filtro.
  ctx.fillStyle = transform.background;
  ctx.fillRect(0, 0, p.side, p.side);
  if (p.backgroundImage) {
    // Fundo em COVER fixo (centrado, sem offset/scale/rotation do usuário).
    drawCover(ctx, p.backgroundImage, layout.center, layout.bleedR * 2);
  }
  if (image) {
    ctx.translate(layout.center + transform.offset.x, layout.center + transform.offset.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    const css = p.filters ? filterString(p.filters) : '';
    if (css) {
      ctx.filter = css;
    }
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
    // Restaura ANTES de guias/sangria/escurecimento (que nunca são filtrados).
    if (css) {
      ctx.filter = 'none';
    }
  }
  ctx.restore();
}

/**
 * Desenha `img` cobrindo (COVER) um quadrado de lado `size` centrado em
 * `center` — o menor lado da imagem preenche o quadrado, centralizado, sem
 * distorção. Usado para o fundo (recorte ao círculo é feito pelo clip do pai).
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  center: number,
  size: number,
): void {
  const iw = img.naturalWidth || 1;
  const ih = img.naturalHeight || 1;
  const scale = Math.max(size / iw, size / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, center - w / 2, center - h / 2, w, h);
}

function drawDarkenOutsideCut(
  ctx: CanvasRenderingContext2D,
  layout: EditorLayout,
  side: number,
): void {
  ctx.save();
  ctx.fillStyle = 'hsl(240 30% 8% / 55%)';
  ctx.beginPath();
  ctx.rect(0, 0, side, side);
  circlePath(ctx, layout.center, layout.cutR, true);
  ctx.fill('evenodd');
  ctx.restore();
}

function drawGuides(ctx: CanvasRenderingContext2D, layout: EditorLayout): void {
  drawGuide(ctx, layout.center, layout.bleedR, [2, 6]);
  drawGuide(ctx, layout.center, layout.cutR, []);
  drawGuide(ctx, layout.center, layout.safeR, [9, 7]);
}

/** Guia com halo claro + traço escuro (contraste sobre qualquer imagem). */
function drawGuide(
  ctx: CanvasRenderingContext2D,
  center: number,
  radius: number,
  dash: number[],
): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'hsl(0 0% 100% / 90%)';
  ctx.lineWidth = 4;
  strokeCircle(ctx, center, radius);
  ctx.setLineDash(dash);
  ctx.strokeStyle = 'hsl(240 40% 10% / 95%)';
  ctx.lineWidth = 2;
  strokeCircle(ctx, center, radius);
  ctx.restore();
}

function circlePath(
  ctx: CanvasRenderingContext2D,
  center: number,
  radius: number,
  counter = false,
): void {
  ctx.moveTo(center + radius, center);
  ctx.arc(center, center, radius, 0, Math.PI * 2, counter);
}

function strokeCircle(
  ctx: CanvasRenderingContext2D,
  center: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.stroke();
}
