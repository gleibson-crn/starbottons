import { DEFAULT_TRANSFORM } from '../../types';
import type { EditorTransform, ImageFilters } from '../../types';
import type { EditorLayout } from '../../utils';
import { drawBottonFace, type BottonFaceParams } from './botton-face';

interface Op {
  readonly op: string;
  readonly filter: string;
  readonly fillStyle: string;
  readonly args?: number[];
}

/** Contexto 2D falso: registra `filter`/`fillStyle` e args de cada operação. */
function makeMockCtx(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const rec = (op: string, args?: number[]): void => {
    ops.push({ op, filter: ctx.filter, fillStyle: ctx.fillStyle, args });
  };
  const ctx = {
    filter: 'none',
    fillStyle: '',
    save: () => undefined,
    restore: () => undefined,
    translate: (x: number, y: number) => rec('translate', [x, y]),
    rotate: (r: number) => rec('rotate', [r]),
    scale: (x: number, y: number) => rec('scale', [x, y]),
    fillRect: () => rec('fillRect'),
    drawImage: (_i: unknown, dx: number, dy: number, dw: number, dh: number) =>
      rec('drawImage', [dx, dy, dw, dh]),
  } as unknown as CanvasRenderingContext2D & { filter: string; fillStyle: string };
  return { ctx, ops };
}

const LAYOUT: EditorLayout = {
  center: 100,
  pxPerMm: 1,
  bleedR: 80,
  cutR: 70,
  safeR: 60,
};

const ART = {} as HTMLImageElement;
const BG = { naturalWidth: 200, naturalHeight: 100 } as HTMLImageElement;

const RED: EditorTransform = { ...DEFAULT_TRANSFORM, background: '#ff0000' };
const VIVID: ImageFilters = { brightness: 1, contrast: 1.2, saturate: 1.4, effect: 'none' };

function params(ctx: CanvasRenderingContext2D, patch: Partial<BottonFaceParams> = {}): BottonFaceParams {
  return {
    ctx,
    side: 200,
    layout: LAYOUT,
    image: ART,
    transform: RED,
    drawW: 120,
    drawH: 120,
    ...patch,
  };
}

describe('drawBottonFace (face fiel — fonte única)', () => {
  it('pinta a COR de fundo (fillRect com o background do transform)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx));
    const fill = ops.find((o) => o.op === 'fillRect');
    expect(fill?.fillStyle).toBe('#ff0000');
    expect(fill?.filter).toBe('none');
  });

  it('sem imagem de fundo desenha só a arte (1 drawImage)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx));
    expect(ops.filter((o) => o.op === 'drawImage').length).toBe(1);
  });

  it('com fundo: cor → fundo → arte, nessa ordem (fundo sob a arte)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { backgroundImage: BG }));
    const draws = ops.filter((o) => o.op === 'drawImage');
    expect(draws.length).toBe(2);
    const fillRect = ops.findIndex((o) => o.op === 'fillRect');
    const firstDraw = ops.findIndex((o) => o.op === 'drawImage');
    expect(fillRect).toBeLessThan(firstDraw);
  });

  it('aplica o backgroundTransform (offset/tamanho) ao fundo', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(
      params(ctx, {
        image: null,
        backgroundImage: BG,
        backgroundTransform: { offset: { x: 12, y: -8 }, scale: 1, rotation: 15 },
        bgDrawW: 240,
        bgDrawH: 120,
      }),
    );
    expect(ops.find((o) => o.op === 'translate')?.args).toEqual([112, 92]);
    expect(ops.find((o) => o.op === 'drawImage')?.args).toEqual([-120, -60, 240, 120]);
  });

  it('filtros aplicam APENAS na arte; a cor nunca é filtrada', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { filters: VIVID }));
    expect(ops.find((o) => o.op === 'fillRect')?.filter).toBe('none');
    expect(ops.find((o) => o.op === 'drawImage')?.filter).toBe(
      'brightness(1) contrast(1.2) saturate(1.4)',
    );
    expect(ctx.filter).toBe('none');
  });

  it('filtros neutros/ausentes mantêm ctx.filter em none o tempo todo', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { backgroundImage: BG }));
    expect(ops.every((o) => o.filter === 'none')).toBe(true);
  });
});

describe('drawBottonFace — espelhar arte (flip)', () => {
  const order = (ops: Op[]): string[] =>
    ops
      .filter((o) => ['translate', 'rotate', 'scale', 'drawImage'].includes(o.op))
      .map((o) => o.op);

  it('sem flip NÃO chama scale (no-op)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx));
    expect(order(ops)).toEqual(['translate', 'rotate', 'drawImage']);
  });

  it('flipH aplica scale(-1,1) após rotate e antes de drawImage', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { transform: { ...RED, flipH: true } }));
    expect(order(ops)).toEqual(['translate', 'rotate', 'scale', 'drawImage']);
    expect(ops.find((o) => o.op === 'scale')?.args).toEqual([-1, 1]);
  });

  it('flipV aplica scale(1,-1)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { transform: { ...RED, flipV: true } }));
    expect(ops.find((o) => o.op === 'scale')?.args).toEqual([1, -1]);
  });
});

describe('drawBottonFace — molduras (empilhadas, no TOPO)', () => {
  it('sem molduras desenha só a arte (1 drawImage)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx));
    expect(ops.filter((o) => o.op === 'drawImage').length).toBe(1);
  });

  it('frames vazio desenha só a arte', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { frames: [] }));
    expect(ops.filter((o) => o.op === 'drawImage').length).toBe(1);
  });

  it('com 1 moldura: arte primeiro, moldura DEPOIS (por cima)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { frames: [{ image: BG }] }));
    const draws = ops.filter((o) => o.op === 'drawImage');
    expect(draws.length).toBe(2);
    expect(draws[0].args).toEqual([-60, -60, 120, 120]);
  });

  it('cor → fundo → arte → moldura (moldura é o último drawImage)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { backgroundImage: BG, frames: [{ image: BG }] }));
    const draws = ops.filter((o) => o.op === 'drawImage');
    expect(draws.length).toBe(3);
    const fillRect = ops.findIndex((o) => o.op === 'fillRect');
    const lastDrawIdx = ops.map((o) => o.op).lastIndexOf('drawImage');
    expect(fillRect).toBeLessThan(lastDrawIdx);
  });

  it('moldura sem enquadramento é COVER no círculo visível, centrada e sem filtro', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(params(ctx, { image: null, frames: [{ image: BG }] }));
    // COVER de 200×100 no diâmetro visível 140 (cutR*2): 280×140 centrado em 100.
    expect(ops.find((o) => o.op === 'translate')?.args).toEqual([100, 100]);
    expect(ops.find((o) => o.op === 'drawImage')?.args).toEqual([-140, -70, 280, 140]);
    expect(ops.find((o) => o.op === 'drawImage')?.filter).toBe('none');
  });

  it('aplica offset, rotação e escala do enquadramento da moldura', () => {
    const { ctx, ops } = makeMockCtx();
    const framing = { offset: { x: 10, y: -20 }, scale: 2, rotation: 90 };
    drawBottonFace(params(ctx, { image: null, frames: [{ image: BG, framing }] }));
    expect(ops.find((o) => o.op === 'translate')?.args).toEqual([110, 80]);
    expect(ops.find((o) => o.op === 'rotate')?.args?.[0]).toBeCloseTo(Math.PI / 2, 10);
    expect(ops.find((o) => o.op === 'drawImage')?.args).toEqual([-280, -140, 560, 280]);
  });

  it('respeita drawW/drawH da moldura quando informados (preset)', () => {
    const { ctx, ops } = makeMockCtx();
    drawBottonFace(
      params(ctx, { image: null, frames: [{ image: BG, drawW: 240, drawH: 120 }] }),
    );
    expect(ops.find((o) => o.op === 'drawImage')?.args).toEqual([-120, -60, 240, 120]);
  });

  it('várias molduras: desenha todas na ordem do array (última por cima)', () => {
    const { ctx, ops } = makeMockCtx();
    const low = { image: BG, drawW: 100, drawH: 100 };
    const mid = { image: BG, drawW: 200, drawH: 200 };
    const top = { image: BG, drawW: 300, drawH: 300 };
    drawBottonFace(params(ctx, { image: null, frames: [low, mid, top] }));
    const draws = ops.filter((o) => o.op === 'drawImage');
    expect(draws.map((d) => d.args?.[2])).toEqual([100, 200, 300]);
  });
});
