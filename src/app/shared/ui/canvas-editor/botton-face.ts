import type { EditorTransform, Framing, ImageFilters } from '../../types';
import { DEFAULT_BACKGROUND_FRAMING, filterString } from '../../types';
import type { PreparedArt } from '../../imaging';
import type { EditorLayout } from '../../utils';
import { imageDrawSize } from '../../utils';

/**
 * Uma MOLDURA já carregada pronta para compor: imagem + enquadramento próprio
 * (offset/scale/rotation). `drawW/drawH` opcionais (preset em px); quando
 * ausentes, o COVER é calculado sobre o círculo VISÍVEL (`cutR*2`). A ordem na
 * lista é o z-order (índice 0 ao fundo; última no topo).
 */
export interface FrameLayer {
  readonly image: HTMLImageElement;
  readonly framing?: Framing | null;
  readonly drawW?: number;
  readonly drawH?: number;
}

/**
 * Parâmetros para pintar a FACE de um botton num ctx JÁ RECORTADO pelo
 * chamador (círculo de sangria no editor; círculo de corte no sprite do mockup).
 */
export interface BottonFaceParams {
  readonly ctx: CanvasRenderingContext2D;
  /** Lado (px) do canvas de destino. */
  readonly side: number;
  readonly layout: EditorLayout;
  /**
   * Arte do usuário. `null` = só cor + fundo. Pode ser um `HTMLImageElement`
   * (caminho tonal atual) OU um canvas/bitmap JÁ estilizado por `prepareArt`
   * (ADR-019); neste caso o chamador OMITE `filters` (o tonal já está baked) e
   * passa `drawW`/`drawH` explícitos (canvas não tem `naturalWidth`).
   */
  readonly image: PreparedArt | null;
  readonly transform: EditorTransform;
  /**
   * Lado (px) em que os OFFSETS (arte e fundo) foram capturados no editor. Os
   * offsets estão nessa unidade; ao pintar num `side` diferente (ex.: sprite do
   * mockup), são escalados por `side / editorSide`. Ausente = igual a `side`
   * (k=1), como no próprio editor.
   */
  readonly editorSide?: number;
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
  /**
   * Molduras decorativas (PNG) EMPILHADAS por CIMA da arte, no TOPO, na ordem do
   * array (z-order). Cada uma cobre o círculo VISÍVEL (`cutR*2`) com seu próprio
   * enquadramento (offset/scale/rotação); nunca filtradas (são decoração).
   */
  readonly frames?: readonly FrameLayer[];
}

/**
 * Pinta a face do botton — FONTE ÚNICA de composição, compartilhada entre o
 * preview do editor (`editor-render`) e o sprite do mockup contextual
 * (`mockup-render`). Camadas, na ordem: cor de base → imagem de fundo (com seu
 * enquadramento) → arte (com filtros) → molduras empilhadas (cada uma com seu
 * enquadramento, por cima de tudo). A transparência do fundo revela a cor; a das
 * molduras revela a arte/moldura abaixo; o recorte ao círculo é responsabilidade
 * do chamador (fora do círculo fica transparente). Guias/sangria/gloss NÃO
 * pertencem à face.
 */
export function drawBottonFace(p: BottonFaceParams): void {
  const { ctx } = p;
  ctx.fillStyle = p.transform.background;
  ctx.fillRect(0, 0, p.side, p.side);
  drawBackground(p);
  drawArt(p);
  drawFrames(p);
}

/**
 * Fator de escala do offset: os offsets vêm em px do `editorSide`; ao pintar num
 * `side` diferente (sprite do mockup), escala proporcionalmente. `1` no editor.
 */
function offsetScale(p: Pick<BottonFaceParams, 'side' | 'editorSide'>): number {
  return p.editorSide && p.editorSide > 0 ? p.side / p.editorSide : 1;
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
  const k = offsetScale(p);
  ctx.save();
  ctx.translate(layout.center + bt.offset.x * k, layout.center + bt.offset.y * k);
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
  const k = offsetScale(p);
  ctx.save();
  ctx.translate(layout.center + transform.offset.x * k, layout.center + transform.offset.y * k);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  applyFlip(ctx, transform);
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

/**
 * Molduras decorativas EMPILHADAS por CIMA da arte, na ordem do array (z-order).
 * Cada uma: translate(centro + offset) → rotate → drawImage em COVER no círculo
 * VISÍVEL (`cutR*2`) × scale do seu enquadramento. Nunca filtradas (decoração).
 * Espelha `drawBackground`, mas cobre no corte (não na sangria) e repete por N.
 */
function drawFrames(
  p: Pick<BottonFaceParams, 'ctx' | 'layout' | 'side' | 'editorSide' | 'frames'>,
): void {
  const frames = p.frames;
  if (!frames?.length) {
    return;
  }
  const { ctx, layout } = p;
  const k = offsetScale(p);
  for (const frame of frames) {
    const fr = frame.framing ?? DEFAULT_BACKGROUND_FRAMING;
    const { w, h } = frameDrawSize(frame, layout, fr.scale);
    ctx.save();
    ctx.translate(layout.center + fr.offset.x * k, layout.center + fr.offset.y * k);
    ctx.rotate((fr.rotation * Math.PI) / 180);
    ctx.drawImage(frame.image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

/** Tamanho de desenho de uma moldura: preset (px) ou COVER no círculo visível. */
function frameDrawSize(
  frame: FrameLayer,
  layout: EditorLayout,
  scale: number,
): { w: number; h: number } {
  if (frame.drawW != null && frame.drawH != null) {
    return { w: frame.drawW, h: frame.drawH };
  }
  const s = imageDrawSize(
    frame.image.naturalWidth,
    frame.image.naturalHeight,
    layout.cutR * 2,
    scale,
  );
  return { w: s.drawW, h: s.drawH };
}

/** Tamanho de desenho: usa o preset (px) ou calcula o COVER (× scale). */
function faceDrawSize(
  presetW: number | undefined,
  presetH: number | undefined,
  img: PreparedArt,
  layout: EditorLayout,
  scale: number,
): { w: number; h: number } {
  if (presetW != null && presetH != null) {
    return { w: presetW, h: presetH };
  }
  // Só o caminho tonal (image = HTMLImageElement) cai aqui: canvas/bitmap
  // estilizados SEMPRE trazem drawW/drawH (preset), acima.
  const el = img as HTMLImageElement;
  const s = imageDrawSize(el.naturalWidth, el.naturalHeight, layout.bleedR * 2, scale);
  return { w: s.drawW, h: s.drawH };
}

/** Espelha no eixo LOCAL da imagem (após translate/rotate); no-op sem flip. */
function applyFlip(ctx: CanvasRenderingContext2D, t: EditorTransform): void {
  const flipH = t.flipH ?? false;
  const flipV = t.flipV ?? false;
  if (flipH || flipV) {
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  }
}
