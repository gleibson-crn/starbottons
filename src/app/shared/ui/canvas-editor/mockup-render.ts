import type { EditorTransform, Framing, ImageFilters, PrintSpec } from '../../types';
import { computeLayout } from '../../utils';
import { drawBottonFace } from './botton-face';

/** Parâmetros para compor o mockup (face visível) de um botton. */
export interface MockupParams {
  readonly image: HTMLImageElement;
  readonly transform: EditorTransform;
  readonly spec: PrintSpec;
  /** Lado do canvas (deve ser o mesmo do editor p/ os offsets baterem). */
  readonly side: number;
  /** Filtros aplicados APENAS à arte (ausência = sem filtro). */
  readonly filters?: ImageFilters;
  /** Imagem de fundo (por cima da cor, por baixo da arte). */
  readonly backgroundImage?: HTMLImageElement | null;
  /** Enquadramento do fundo (ausente/`null` = neutro, cover centrado). */
  readonly backgroundTransform?: Framing | null;
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

/**
 * Face FIEL ao editor: recorta ao CÍRCULO DE CORTE (fora fica transparente — sem
 * cantos brancos nem linha de corte) e delega a composição (cor → fundo → arte
 * com filtros) ao helper compartilhado `drawBottonFace`. Mesma matemática do
 * preview do editor (ADR-017).
 */
function drawFace(
  ctx: CanvasRenderingContext2D,
  p: MockupParams,
  center: number,
  cutR: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, cutR, 0, Math.PI * 2);
  ctx.clip();
  drawBottonFace({
    ctx,
    side: p.side,
    layout: computeLayout(p.spec, p.side),
    image: p.image,
    transform: p.transform,
    filters: p.filters,
    backgroundImage: p.backgroundImage,
    backgroundTransform: p.backgroundTransform,
  });
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

// ---------------------------------------------------------------------------
// MOCKUP CONTEXTUAL — sprite do botton + composição sobre foto de cenário.
// ---------------------------------------------------------------------------

/** Fração de headroom de resolução do sprite sobre o raio-alvo. */
const SPRITE_HEADROOM = 1.15;
/** Teto do lado do sprite (memória/perf). */
const SPRITE_MAX_SIDE = 2048;
/** Piso do lado do sprite (nitidez mínima). */
const SPRITE_MIN_SIDE = 64;

/** Sprite do botton pronto para colagem: canvas + raio/centro do disco (px). */
export interface MockupSprite {
  readonly canvas: HTMLCanvasElement;
  readonly discRadiusPx: number;
  readonly discCenter: { x: number; y: number };
}

/** Alvo circular na cena, em px da própria cena (não normalizado). */
export interface SceneTargetPx {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly rotation: number;
}

/** Parâmetros de composição contextual (botton sobre foto). */
export interface ContextualParams {
  readonly scene: HTMLImageElement;
  readonly sprite: MockupSprite;
  readonly target: SceneTargetPx;
  readonly lighting?: 'none' | 'multiply-soft';
}

/**
 * Lado (px) do canvas do sprite para um raio-alvo, mantendo nitidez: o disco
 * nativo do sprite fica ~15% maior que o raio de destino, com teto de 2048.
 * `k` (raio-do-disco / lado) é constante para uma spec — deriva de
 * ART_FILL_RATIO via computeLayout, então usamos um lado de referência.
 */
export function spriteSide(targetRadiusPx: number, spec: PrintSpec): number {
  const ref = 1000;
  const k = computeLayout(spec, ref).cutR / ref;
  const raw = Math.ceil((targetRadiusPx / k) * SPRITE_HEADROOM);
  return Math.max(SPRITE_MIN_SIDE, Math.min(SPRITE_MAX_SIDE, raw));
}

/** Parâmetros do sprite: mesmo enquadramento do editor + raio-alvo desejado. */
export interface SpriteParams {
  readonly image: HTMLImageElement;
  readonly transform: EditorTransform;
  readonly spec: PrintSpec;
  /** Raio (px) que o disco terá na cena — dimensiona o sprite p/ nitidez. */
  readonly targetRadiusPx: number;
  /** Filtros aplicados APENAS à arte (ausência = sem filtro). */
  readonly filters?: ImageFilters;
  /** Imagem de fundo (por cima da cor, por baixo da arte). */
  readonly backgroundImage?: HTMLImageElement | null;
  /** Enquadramento do fundo (ausente/`null` = neutro, cover centrado). */
  readonly backgroundTransform?: Framing | null;
}

/** Rende o sprite FIEL do botton dimensionado a partir do raio-alvo (reusa renderMockup). */
export function renderMockupSprite(p: SpriteParams): MockupSprite {
  const side = spriteSide(p.targetRadiusPx, p.spec);
  const canvas = renderMockup({
    image: p.image,
    transform: p.transform,
    spec: p.spec,
    side,
    filters: p.filters,
    backgroundImage: p.backgroundImage,
    backgroundTransform: p.backgroundTransform,
  });
  const layout = computeLayout(p.spec, side);
  return {
    canvas,
    discRadiusPx: layout.cutR,
    discCenter: { x: layout.center, y: layout.center },
  };
}

/**
 * Compõe o botton sobre a foto de cenário na RESOLUÇÃO NATURAL da cena:
 * fundo → sombra de contato → disco (translate/rotate/scale/drawImage) →
 * (opcional) iluminação multiply-soft clipada ao disco.
 */
export function renderContextualMockup(p: ContextualParams): HTMLCanvasElement {
  const width = p.scene.naturalWidth || p.scene.width;
  const height = p.scene.naturalHeight || p.scene.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D indisponível.');
  }
  ctx.drawImage(p.scene, 0, 0, width, height);
  drawContactShadow(ctx, p.target);
  drawDisc(ctx, p.sprite, p.target);
  if (p.lighting === 'multiply-soft') {
    applyMultiplySoft(ctx, p.target);
  }
  return canvas;
}

/** Sombra radial escura sob o alvo (leve deslocamento p/ baixo = contato). */
function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  target: SceneTargetPx,
): void {
  const cy = target.cy + target.r * 0.12;
  const outer = target.r * 1.22;
  ctx.save();
  const grad = ctx.createRadialGradient(
    target.cx, cy, target.r * 0.6,
    target.cx, cy, outer,
  );
  grad.addColorStop(0, 'hsl(240 40% 6% / 38%)');
  grad.addColorStop(1, 'hsl(240 40% 6% / 0%)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(target.cx, cy, outer, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Cola o disco do botton no alvo: translate → rotate → scale → drawImage. */
function drawDisc(
  ctx: CanvasRenderingContext2D,
  sprite: MockupSprite,
  target: SceneTargetPx,
): void {
  const k = target.r / sprite.discRadiusPx;
  ctx.save();
  ctx.translate(target.cx, target.cy);
  ctx.rotate((target.rotation * Math.PI) / 180);
  ctx.scale(k, k);
  ctx.drawImage(sprite.canvas, -sprite.discCenter.x, -sprite.discCenter.y);
  ctx.restore();
}

/**
 * Iluminação suave: amostra a cena sob o disco, borra e redesenha em
 * `multiply` (alpha baixo) clipado ao disco — integra o botton à luz da foto.
 * Defensivo: se getImageData falhar (canvas "tainted"), é um no-op.
 */
function applyMultiplySoft(
  ctx: CanvasRenderingContext2D,
  target: SceneTargetPx,
): void {
  const sample = sampleUnderDisc(ctx, target);
  if (!sample) {
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(target.cx, target.cy, target.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.15;
  ctx.filter = 'blur(6px)';
  ctx.drawImage(sample, target.cx - target.r, target.cy - target.r);
  ctx.restore();
}

/** Extrai a região quadrada sob o disco como um canvas destacável. */
function sampleUnderDisc(
  ctx: CanvasRenderingContext2D,
  target: SceneTargetPx,
): HTMLCanvasElement | null {
  const size = Math.max(1, Math.round(target.r * 2));
  const x = Math.round(target.cx - target.r);
  const y = Math.round(target.cy - target.r);
  try {
    const data = ctx.getImageData(x, y, size, size);
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    out.getContext('2d')?.putImageData(data, 0, 0);
    return out;
  } catch {
    return null;
  }
}
