import { DEFAULT_TRANSFORM } from '../../types';
import type { PrintSpec } from '../../types';
import {
  renderContextualMockup,
  renderMockup,
  renderMockupSprite,
  spriteSide,
  type MockupSprite,
} from './mockup-render';

/** Contexto 2D falso: registra chamadas de transform/desenho p/ asserções. */
interface Recorded {
  translate: [number, number][];
  scale: [number, number][];
  rotate: number[];
  drawImage: unknown[][];
  arc: [number, number, number][];
}

function makeMockCtx(rec: Recorded): CanvasRenderingContext2D {
  const grad = { addColorStop: (): void => undefined };
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    clip: () => undefined,
    fill: () => undefined,
    fillRect: () => undefined,
    clearRect: () => undefined,
    translate: (x: number, y: number) => void rec.translate.push([x, y]),
    scale: (x: number, y: number) => void rec.scale.push([x, y]),
    rotate: (r: number) => void rec.rotate.push(r),
    arc: (x: number, y: number, r: number) => void rec.arc.push([x, y, r]),
    drawImage: (...a: unknown[]) => void rec.drawImage.push(a),
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: () => undefined,
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function emptyRec(): Recorded {
  return { translate: [], scale: [], rotate: [], drawImage: [], arc: [] };
}

const SPEC: PrintSpec = {
  model: 'round',
  sizeMm: 58,
  visibleMm: 58,
  bleedMm: 2,
  safeMm: 6,
  artDiameterMm: 62,
  dpiTarget: 300,
};

function fakeImage(w: number, h: number): HTMLImageElement {
  return { naturalWidth: w, naturalHeight: h, width: w, height: h } as HTMLImageElement;
}

describe('mockup-render (contextual)', () => {
  let rec: Recorded;

  beforeEach(() => {
    rec = emptyRec();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      makeMockCtx(rec) as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    );
  });

  it('spriteSide cresce com o raio-alvo e respeita o teto de 2048', () => {
    const small = spriteSide(100, SPEC);
    const big = spriteSide(5000, SPEC);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(2048);
    expect(small).toBeGreaterThanOrEqual(64);
  });

  it('renderContextualMockup usa as dimensões naturais da cena', () => {
    const canvas = renderContextualMockup({
      scene: fakeImage(800, 600),
      sprite: sprite(),
      target: { cx: 400, cy: 300, r: 120, rotation: 0 },
    });
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('posiciona o disco no centro do alvo com escala r/discRadiusPx', () => {
    renderContextualMockup({
      scene: fakeImage(1000, 1000),
      sprite: sprite(),
      target: { cx: 250, cy: 400, r: 50, rotation: 0 },
    });
    expect(rec.translate).toContainEqual([250, 400]);
    // discRadiusPx = 100 no sprite fake → escala esperada = 50/100 = 0.5
    expect(rec.scale).toContainEqual([0.5, 0.5]);
  });

  it('renderMockupSprite deriva discRadiusPx/discCenter de computeLayout', () => {
    const s = renderMockupSprite({
      image: fakeImage(1200, 1200),
      transform: DEFAULT_TRANSFORM,
      spec: SPEC,
      targetRadiusPx: 200,
    });
    expect(s.discRadiusPx).toBeGreaterThan(0);
    expect(s.discCenter.x).toBe(s.canvas.width / 2);
    expect(s.discCenter.y).toBe(s.canvas.height / 2);
  });

  it('renderMockup (modo circular) não regrediu: canvas quadrado do lado dado', () => {
    const canvas = renderMockup({
      image: fakeImage(1000, 1000),
      transform: DEFAULT_TRANSFORM,
      spec: SPEC,
      side: 520,
    });
    expect(canvas.width).toBe(520);
    expect(canvas.height).toBe(520);
    // desenhou a arte (drawImage) e recortou no círculo (arc)
    expect(rec.drawImage.length).toBeGreaterThan(0);
    expect(rec.arc.length).toBeGreaterThan(0);
  });

  function sprite(): MockupSprite {
    return {
      canvas: document.createElement('canvas'),
      discRadiusPx: 100,
      discCenter: { x: 150, y: 150 },
    };
  }
});
