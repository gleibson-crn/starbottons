import { makeImageData } from './image-data';

/** Tinta de uma tela CMYK. */
type Ink = 'c' | 'm' | 'y' | 'k';

/** Opções do meio-tom CMYK. */
export interface HalftoneOptions {
  /** Lado da célula da grade, em px. */
  readonly cellPx: number;
  /** Fator de redução do preto (K), 0..1: menor = menos preto. */
  readonly kScale: number;
}

/** Configuração de uma tela (screen) de tinta a carimbar. */
interface ScreenCfg {
  readonly cell: number;
  readonly angleDeg: number;
  readonly ink: Ink;
  readonly kScale: number;
}

/** Contexto geométrico de uma célula da grade rotacionada. */
interface CellCtx {
  readonly cx: number;
  readonly cy: number;
  readonly cos: number;
  readonly sin: number;
  readonly i: number;
  readonly j: number;
  readonly maxR: number;
}

/**
 * halftone — meio-tom CMYK COLORIDO. Quatro telas de tinta (C, M, Y, K) em
 * ângulos clássicos (C15°, M75°, Y0°, K45°) sobre fundo branco; cada célula
 * estampa um disco cujo raio = √cobertura · maxR e cuja tinta SUBTRAI seu(s)
 * canal(is) — C zera R, M zera G, Y zera B, K zera R,G,B. `kScale` reduz o
 * preto. Função PURA e DETERMINÍSTICA; o alpha do `src` é preservado. Base do
 * preset "Meio-tom" (resolution-dependent: bake recalcula em alta resolução).
 */
export function halftone(src: ImageData, opts: HalftoneOptions): ImageData {
  const cell = Math.max(2, Math.round(opts.cellPx));
  const k = opts.kScale;
  const out = whiteWithAlpha(src);
  const screens: readonly ScreenCfg[] = [
    { cell, angleDeg: 15, ink: 'c', kScale: k },
    { cell, angleDeg: 75, ink: 'm', kScale: k },
    { cell, angleDeg: 0, ink: 'y', kScale: k },
    { cell, angleDeg: 45, ink: 'k', kScale: k },
  ];
  for (const cfg of screens) {
    stampScreen(out, src, cfg);
  }
  return out;
}

/** Carimba uma tela inteira de tinta sobre a saída. */
function stampScreen(out: ImageData, src: ImageData, cfg: ScreenCfg): void {
  const { width: w, height: h } = src;
  const rad = (cfg.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  const maxR = (cfg.cell / 2) * Math.SQRT2;
  const span = Math.ceil(Math.hypot(w, h) / cfg.cell) + 1;
  for (let j = -span; j <= span; j++) {
    for (let i = -span; i <= span; i++) {
      stampCell(out, src, cfg, { cx, cy, cos, sin, i, j, maxR });
    }
  }
}

/** Carimba o disco de uma célula, amostrando a cobertura no seu centro. */
function stampCell(out: ImageData, src: ImageData, cfg: ScreenCfg, g: CellCtx): void {
  const u = g.i * cfg.cell;
  const v = g.j * cfg.cell;
  const px = Math.round(g.cx + u * g.cos - v * g.sin);
  const py = Math.round(g.cy + u * g.sin + v * g.cos);
  if (px < 0 || px >= src.width || py < 0 || py >= src.height) {
    return;
  }
  const cov = cmykCoverageAt(src, px, py, cfg);
  if (cov <= 0) {
    return;
  }
  const r = Math.sqrt(cov) * g.maxR;
  if (r < 0.5) {
    return;
  }
  fillDotSub(out, px, py, r, cfg.ink);
}

/** Cobertura (0..1) da tinta `cfg.ink` no pixel (px,py) via modelo CMYK. */
function cmykCoverageAt(src: ImageData, px: number, py: number, cfg: ScreenCfg): number {
  const i = (py * src.width + px) * 4;
  const r = src.data[i] / 255;
  const g = src.data[i + 1] / 255;
  const b = src.data[i + 2] / 255;
  const k = 1 - Math.max(r, g, b);
  if (cfg.ink === 'k') {
    return k * cfg.kScale;
  }
  if (k >= 1) {
    return 0;
  }
  if (cfg.ink === 'c') {
    return (1 - r - k) / (1 - k);
  }
  if (cfg.ink === 'm') {
    return (1 - g - k) / (1 - k);
  }
  return (1 - b - k) / (1 - k);
}

/** Preenche um disco de raio `r`, subtraindo o(s) canal(is) da tinta. */
function fillDotSub(out: ImageData, px: number, py: number, r: number, ink: Ink): void {
  const w = out.width;
  const h = out.height;
  const r2 = r * r;
  const y0 = Math.max(0, Math.floor(py - r));
  const y1 = Math.min(h - 1, Math.ceil(py + r));
  const x0 = Math.max(0, Math.floor(px - r));
  const x1 = Math.min(w - 1, Math.ceil(px + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - px) ** 2 + (y - py) ** 2 <= r2) {
        subInk(out.data, (y * w + x) * 4, ink);
      }
    }
  }
}

/** Zera o(s) canal(is) da tinta no offset `k` (multiply/hard subtractive). */
function subInk(d: Uint8ClampedArray, k: number, ink: Ink): void {
  if (ink === 'c') {
    d[k] = 0;
    return;
  }
  if (ink === 'm') {
    d[k + 1] = 0;
    return;
  }
  if (ink === 'y') {
    d[k + 2] = 0;
    return;
  }
  d[k] = 0;
  d[k + 1] = 0;
  d[k + 2] = 0;
}

/** Base branca preservando o alpha original (fundo do padrão de pontos). */
function whiteWithAlpha(src: ImageData): ImageData {
  const s = src.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = s[i + 3];
  }
  return makeImageData(out, src.width, src.height);
}
