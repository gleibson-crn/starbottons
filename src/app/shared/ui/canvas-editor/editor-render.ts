import type { EditorTransform, Framing, ImageFilters } from '../../types';
import { DEFAULT_BACKGROUND_FRAMING, filterString } from '../../types';
import type { EditorLayout } from '../../utils';
import { imageDrawSize } from '../../utils';

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
  // A cor de base NÃO recebe filtro. É pintada ANTES do fundo para que a
  // transparência da imagem de fundo revele esta cor (composição cor + imagem).
  ctx.fillStyle = transform.background;
  ctx.fillRect(0, 0, p.side, p.side);
  drawBackgroundLayer(p);
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
 * Desenha o fundo com o MESMO enquadramento da arte (translate→rotate→drawImage
 * centrado no tamanho em COVER × `scale`). O `save`/`restore` interno isola o
 * transform do fundo para não afetar a arte desenhada a seguir. Recorte ao
 * círculo vem do clip do pai. No enquadramento neutro é idêntico ao COVER fixo.
 */
function drawBackgroundLayer(p: SceneParams): void {
  const img = p.backgroundImage;
  if (!img) {
    return;
  }
  const bt = p.backgroundTransform ?? DEFAULT_BACKGROUND_FRAMING;
  const { w, h } = bgDrawSize(p, img, bt.scale);
  const { ctx, layout } = p;
  ctx.save();
  ctx.translate(layout.center + bt.offset.x, layout.center + bt.offset.y);
  ctx.rotate((bt.rotation * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Tamanho de desenho do fundo: usa o passado ou calcula o COVER (× scale). */
function bgDrawSize(
  p: SceneParams,
  img: HTMLImageElement,
  scale: number,
): { w: number; h: number } {
  if (p.bgDrawW != null && p.bgDrawH != null) {
    return { w: p.bgDrawW, h: p.bgDrawH };
  }
  const s = imageDrawSize(
    img.naturalWidth,
    img.naturalHeight,
    p.layout.bleedR * 2,
    scale,
  );
  return { w: s.drawW, h: s.drawH };
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
