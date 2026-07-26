import type { MockupSprite, SceneTargetPx } from '../../../shared/ui';
import { drawScenePreview } from './scene-preview-render';

/** Registra chamadas relevantes do ctx 2D (fills com o estilo vigente + arcs). */
interface Recorded {
  fills: string[];
  arcs: [number, number, number][];
  drawImage: number;
}

function makeMockCtx(rec: Recorded): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    rect: () => undefined,
    moveTo: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    stroke: () => undefined,
    drawImage: () => void (rec.drawImage += 1),
    arc: (x: number, y: number, r: number) => void rec.arcs.push([x, y, r]),
    fill: function fill(this: { fillStyle: string }): void {
      rec.fills.push(this.fillStyle);
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

function emptyRec(): Recorded {
  return { fills: [], arcs: [], drawImage: 0 };
}

const TARGET: SceneTargetPx = { cx: 100, cy: 120, r: 40, rotation: 0 };
/** Cor do disco placeholder (só no modo curadoria, sprite === null). */
const PLACEHOLDER_FILL = 'hsl(245 72% 58% / 26%)';

function fakeSprite(): MockupSprite {
  return {
    canvas: {} as HTMLCanvasElement,
    discCenter: { x: 50, y: 50 },
    discRadiusPx: 100,
  } as unknown as MockupSprite;
}

describe('drawScenePreview — disco placeholder (curadoria)', () => {
  it('desenha o disco translúcido no alvo quando sprite === null', () => {
    const rec = emptyRec();
    drawScenePreview({
      ctx: makeMockCtx(rec),
      width: 300,
      height: 400,
      scene: null,
      sprite: null,
      target: TARGET,
    });
    expect(rec.fills).toContain(PLACEHOLDER_FILL);
    // arco extra do placeholder (além do scrim e do anel duplo).
    expect(rec.arcs.some(([x, y, r]) => x === 100 && y === 120 && r === 40)).toBe(true);
    // sem botton para colar → nada de drawImage.
    expect(rec.drawImage).toBe(0);
  });

  it('NÃO desenha o placeholder quando há sprite (modo aplicar inalterado)', () => {
    const rec = emptyRec();
    drawScenePreview({
      ctx: makeMockCtx(rec),
      width: 300,
      height: 400,
      scene: null,
      sprite: fakeSprite(),
      target: TARGET,
    });
    expect(rec.fills).not.toContain(PLACEHOLDER_FILL);
    // o botton é colado normalmente.
    expect(rec.drawImage).toBe(1);
  });
});
