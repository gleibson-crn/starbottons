import type { EditorTransform, Framing, ImageFilters } from '../../types';
import type { PreparedArt } from '../../imaging';
import type { EditorLayout } from '../../utils';
import { drawBottonFace, type FrameLayer } from './botton-face';

/** Parâmetros de uma cena completa do editor. */
export interface SceneParams {
  readonly ctx: CanvasRenderingContext2D;
  readonly side: number;
  readonly layout: EditorLayout;
  /** Arte: imagem original (tonal) OU canvas já estilizado (`prepareArt`). */
  readonly image: PreparedArt | null;
  readonly transform: EditorTransform;
  readonly drawW: number;
  readonly drawH: number;
  /** Filtros aplicados APENAS à imagem (opcional; ausência = sem filtro). */
  readonly filters?: ImageFilters;
  /**
   * Imagem de fundo já carregada. Desenhada por cima da COR e por baixo da
   * arte, com o mesmo enquadramento (translate→rotate→drawImage centrado) da
   * arte. A transparência da imagem revela a cor `transform.background`.
   */
  readonly backgroundImage?: HTMLImageElement | null;
  /**
   * Enquadramento do fundo (posição/zoom/rotação). Ausente/`null` = neutro
   * (centrado, cover exato, 0°) — idêntico ao antigo COVER fixo.
   */
  readonly backgroundTransform?: Framing | null;
  /** Tamanho de desenho do fundo (px). Se ausente, calculado em COVER. */
  readonly bgDrawW?: number;
  readonly bgDrawH?: number;
  /**
   * Molduras decorativas já carregadas, EMPILHADAS por CIMA da arte (no topo) na
   * ordem do array (z-order). Cada uma tem seu enquadramento e cobre o círculo
   * VISÍVEL. A transparência revela a arte/moldura abaixo.
   */
  readonly frames?: readonly FrameLayer[];
}

/** Desenha a cena inteira: fundo, imagem, escurecimento e guias. */
export function drawScene(p: SceneParams): void {
  const { ctx, side, layout } = p;
  ctx.clearRect(0, 0, side, side);
  drawImageLayer(p);
  drawDarkenOutsideCut(ctx, layout, side);
  drawGuides(ctx, layout);
}

/**
 * Recorta ao círculo de sangria e delega a composição da face (cor → fundo →
 * arte com filtros → moldura) ao helper compartilhado `drawBottonFace` — a MESMA
 * matemática usada pelo sprite do mockup contextual. Guias/sangria/escurecimento
 * ficam FORA do clip da face (nunca são filtrados).
 */
function drawImageLayer(p: SceneParams): void {
  const { ctx, layout } = p;
  ctx.save();
  circlePath(ctx, layout.center, layout.bleedR);
  ctx.clip();
  drawBottonFace({
    ctx,
    side: p.side,
    layout,
    image: p.image,
    transform: p.transform,
    filters: p.filters,
    backgroundImage: p.backgroundImage,
    backgroundTransform: p.backgroundTransform,
    frames: p.frames,
    drawW: p.drawW,
    drawH: p.drawH,
    bgDrawW: p.bgDrawW,
    bgDrawH: p.bgDrawH,
  });
  ctx.restore();
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
