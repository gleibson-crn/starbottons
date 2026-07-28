import type { EditorTransform, Framing, ImageFilters } from '../../types';
import { DEFAULT_BACKGROUND_FRAMING, filterString } from '../../types';
import type { EditorLayout } from '../../utils';
import { imageDrawSize } from '../../utils';

/**
 * Parâmetros para pintar a FACE de um botton num ctx JÁ RECORTADO pelo
 * chamador (círculo de sangria no editor; círculo de corte no sprite do mockup).
 */
export interface BottonFaceParams {
  readonly ctx: CanvasRenderingContext2D;
  /** Lado (px) do canvas de destino. */
  readonly side: number;
  readonly layout: EditorLayout;
  /** Arte do usuário. `null` = só cor + fundo. */
  readonly image: HTMLImageElement | null;
  readonly transform: EditorTransform;
  /** Filtros aplicados APENAS à arte (ausência = sem filtro). */
  readonly filters?: ImageFilters;
  /** Imagem de fundo (por cima da cor, por baixo da arte). */
  readonly backgroundImage?: HTMLImageElement | null;
  /** Enquadramento do fundo (ausente/`null` = neutro, cover centrado). */
  readonly backgroundTransform?: Framing | null;
  /** Tamanho de desenho da arte (px); se ausente, calculado em COVER. */
  readonly drawW?: number;
  readonly drawH?: number;
  /** Tamanho de desenho do fundo (px); se ausente, calculado em COVER. */
  readonly bgDrawW?: number;
  readonly bgDrawH?: number;
}

/**
 * Pinta a face do botton — FONTE ÚNICA de composição, compartilhada entre o
 * preview do editor (`editor-render`) e o sprite do mockup contextual
 * (`mockup-render`). Camadas, na ordem: cor de base → imagem de fundo (com seu
 * enquadramento) → arte (com filtros). A transparência do fundo revela a cor; o
 * recorte ao círculo é responsabilidade do chamador (fora do círculo fica
 * transparente). Guias/sangria/gloss NÃO pertencem à face.
 */
export function drawBottonFace(p: BottonFaceParams): void {
  const { ctx } = p;
  ctx.fillStyle = p.transform.background;
  ctx.fillRect(0, 0, p.side, p.side);
  drawBackground(p);
  drawArt(p);
}

/** Fundo com o mesmo enquadramento da arte (translate→rotate→drawImage). */
function drawBackground(p: BottonFaceParams): void {
  const img = p.backgroundImage;
  if (!img) {
    return;
  }
  const bt = p.backgroundTransform ?? DEFAULT_BACKGROUND_FRAMING;
  const { w, h } = faceDrawSize(p.bgDrawW, p.bgDrawH, img, p.layout, bt.scale);
  const { ctx, layout } = p;
  ctx.save();
  ctx.translate(layout.center + bt.offset.x, layout.center + bt.offset.y);
  ctx.rotate((bt.rotation * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Arte do usuário com filtros (restaurados antes de devolver o ctx). */
function drawArt(p: BottonFaceParams): void {
  const img = p.image;
  if (!img) {
    return;
  }
  const { w, h } = faceDrawSize(p.drawW, p.drawH, img, p.layout, p.transform.scale);
  const { ctx, layout, transform } = p;
  ctx.save();
  ctx.translate(layout.center + transform.offset.x, layout.center + transform.offset.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  const css = p.filters ? filterString(p.filters) : '';
  if (css) {
    ctx.filter = css;
  }
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (css) {
    ctx.filter = 'none';
  }
  ctx.restore();
}

/** Tamanho de desenho: usa o preset (px) ou calcula o COVER (× scale). */
function faceDrawSize(
  presetW: number | undefined,
  presetH: number | undefined,
  img: HTMLImageElement,
  layout: EditorLayout,
  scale: number,
): { w: number; h: number } {
  if (presetW != null && presetH != null) {
    return { w: presetW, h: presetH };
  }
  const s = imageDrawSize(img.naturalWidth, img.naturalHeight, layout.bleedR * 2, scale);
  return { w: s.drawW, h: s.drawH };
}
