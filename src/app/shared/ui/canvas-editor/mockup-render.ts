import type {
  EditorTransform,
  Framing,
  ImageFilters,
  PrintSpec,
  StyleEffect,
} from '../../types';
import { DEFAULT_FILTERS, DEFAULT_STYLE_EFFECT, isDefaultStyle } from '../../types';
import { prepareArt } from '../../imaging';
import { computeLayout, imageDrawSize, type EditorLayout } from '../../utils';
import { drawBottonFace, type FrameLayer } from './botton-face';

/** Parâmetros para compor o mockup (face visível) de um botton. */
export interface MockupParams {
  readonly image: HTMLImageElement;
  readonly transform: EditorTransform;
  readonly spec: PrintSpec;
  /** Lado do canvas de destino (pode diferir do editor no sprite do mockup). */
  readonly side: number;
  /** Lado (px) em que os offsets foram capturados no editor (escala do offset). */
  readonly editorSide: number;
  /** Filtros aplicados APENAS à arte (ausência = sem filtro). */
  readonly filters?: ImageFilters;
  /** Efeito de estilo por pixel (ADR-019; ausência/`none` = sem estilo). */
  readonly style?: StyleEffect;
  /** Imagem de fundo (por cima da cor, por baixo da arte). */
  readonly backgroundImage?: HTMLImageElement | null;
  /** Enquadramento do fundo (ausente/`null` = neutro, cover centrado). */
  readonly backgroundTransform?: Framing | null;
  /** Molduras decorativas EMPILHADAS (z-order), cada uma com seu enquadramento. */
  readonly frames?: readonly FrameLayer[];
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
  // Sem gloss aqui: a sprite é a face PLANA. O volume 3D (sombra/curvatura/aro/
  // brilho) é aplicado pelo compositor `renderContextualMockup`, evitando efeito
  // dobrado e permitindo tunar a profundidade sobre a cena.
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
  const layout = computeLayout(p.spec, p.side);
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, cutR, 0, Math.PI * 2);
  ctx.clip();
  // As molduras cobrem no círculo VISÍVEL (corte): `drawBottonFace` calcula o
  // COVER em `cutR*2` por moldura, mantendo-as dentro do clip de corte.
  drawBottonFace({
    ctx,
    side: p.side,
    editorSide: p.editorSide,
    layout,
    ...faceArt(p, layout),
    transform: p.transform,
    backgroundImage: p.backgroundImage,
    backgroundTransform: p.backgroundTransform,
    frames: p.frames,
  });
  ctx.restore();
}

/**
 * Resolve a arte a compor: sem estilo → imagem + `filters` (caminho tonal
 * atual, `drawW/drawH` em COVER). Com estilo → `prepareArt` (MESMA função do
 * editor/bake, garantindo paridade) devolve um canvas baked; nesse caso o tonal
 * já foi aplicado, então `filters` é OMITIDO e `drawW/drawH` vão explícitos
 * (canvas não tem `naturalWidth`).
 */
function faceArt(
  p: MockupParams,
  layout: EditorLayout,
): Pick<Parameters<typeof drawBottonFace>[0], 'image' | 'filters' | 'drawW' | 'drawH'> {
  const style = p.style ?? DEFAULT_STYLE_EFFECT;
  if (isDefaultStyle(style)) {
    return { image: p.image, filters: p.filters };
  }
  const styled = prepareArt(p.image, p.filters ?? DEFAULT_FILTERS, style, p.side);
  const size = imageDrawSize(
    p.image.naturalWidth,
    p.image.naturalHeight,
    layout.bleedR * 2,
    p.transform.scale,
  );
  return { image: styled, drawW: size.drawW, drawH: size.drawH };
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
  /** Lado (px) em que os offsets foram capturados no editor (escala do offset). */
  readonly editorSide: number;
  /** Raio (px) que o disco terá na cena — dimensiona o sprite p/ nitidez. */
  readonly targetRadiusPx: number;
  /** Filtros aplicados APENAS à arte (ausência = sem filtro). */
  readonly filters?: ImageFilters;
  /** Efeito de estilo por pixel (ADR-019; ausência/`none` = sem estilo). */
  readonly style?: StyleEffect;
  /** Imagem de fundo (por cima da cor, por baixo da arte). */
  readonly backgroundImage?: HTMLImageElement | null;
  /** Enquadramento do fundo (ausente/`null` = neutro, cover centrado). */
  readonly backgroundTransform?: Framing | null;
  /** Molduras decorativas EMPILHADAS (z-order), cada uma com seu enquadramento. */
  readonly frames?: readonly FrameLayer[];
}

/** Rende o sprite FIEL do botton dimensionado a partir do raio-alvo (reusa renderMockup). */
export function renderMockupSprite(p: SpriteParams): MockupSprite {
  const side = spriteSide(p.targetRadiusPx, p.spec);
  const canvas = renderMockup({
    image: p.image,
    transform: p.transform,
    spec: p.spec,
    side,
    editorSide: p.editorSide,
    filters: p.filters,
    style: p.style,
    backgroundImage: p.backgroundImage,
    backgroundTransform: p.backgroundTransform,
    frames: p.frames,
  });
  const layout = computeLayout(p.spec, side);
  return {
    canvas,
    discRadiusPx: layout.cutR,
    discCenter: { x: layout.center, y: layout.center },
  };
}

/**
 * Compõe o botton sobre a foto de cenário na RESOLUÇÃO NATURAL da cena, com
 * PROFUNDIDADE de pin-back real: sombra projetada (descola da roupa) → disco →
 * sombreamento de curvatura + aro nas BORDAS → brilho glossy especular →
 * (opcional) iluminação multiply-soft. Assim o botton deixa de parecer adesivo
 * plano.
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
  drawDropShadow(ctx, p.target);
  drawDisc(ctx, p.sprite, p.target);
  drawEdgeShading(ctx, p.target);
  drawSpecular(ctx, p.target);
  if (p.lighting === 'multiply-soft') {
    applyMultiplySoft(ctx, p.target);
  }
  return canvas;
}

/**
 * Sombra PROJETADA: disco escuro borrado, deslocado p/ baixo/direita (luz vinda
 * de cima-esquerda), dando a sensação de que o botton se ergue sobre a roupa.
 */
function drawDropShadow(
  ctx: CanvasRenderingContext2D,
  target: SceneTargetPx,
): void {
  const blur = Math.max(2, target.r * 0.07);
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = 'hsl(240 30% 4% / 45%)';
  ctx.beginPath();
  ctx.arc(target.cx + target.r * 0.05, target.cy + target.r * 0.11, target.r * 1.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Sombreamento de CURVATURA + ARO, clipado ao disco: vinheta radial que escurece
 * as bordas (o botton é abaulado → a borda "foge") e um aro fino escuro na beira
 * (metal/plástico crimpado). Dá volume sem alterar o miolo da arte.
 */
function drawEdgeShading(
  ctx: CanvasRenderingContext2D,
  target: SceneTargetPx,
): void {
  const { cx, cy, r } = target;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
  g.addColorStop(0, 'hsl(240 30% 5% / 0%)');
  g.addColorStop(0.82, 'hsl(240 30% 5% / 12%)');
  g.addColorStop(1, 'hsl(240 30% 4% / 46%)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Aro: traço escuro na beira + fio de realce logo dentro (brilho do metal).
  const rim = Math.max(1, r * 0.03);
  ctx.lineWidth = rim;
  ctx.strokeStyle = 'hsl(240 30% 3% / 55%)';
  ctx.beginPath();
  ctx.arc(cx, cy, r - rim / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, rim * 0.6);
  ctx.strokeStyle = 'hsl(0 0% 100% / 22%)';
  ctx.beginPath();
  ctx.arc(cx, cy, r - rim * 1.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Brilho glossy: mancha especular suave no topo-esquerdo (luz refletida). */
function drawSpecular(
  ctx: CanvasRenderingContext2D,
  target: SceneTargetPx,
): void {
  const { cx, cy, r } = target;
  const hx = cx - r * 0.34;
  const hy = cy - r * 0.4;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createRadialGradient(hx, hy, r * 0.02, hx, hy, r * 0.72);
  g.addColorStop(0, 'hsl(0 0% 100% / 32%)');
  g.addColorStop(0.45, 'hsl(0 0% 100% / 8%)');
  g.addColorStop(1, 'hsl(0 0% 100% / 0%)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
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
