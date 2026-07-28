import { DEFAULT_TRANSFORM } from '../../types';
import type { ImageFilters } from '../../types';
import type { EditorLayout } from '../../utils';
import { drawScene, type SceneParams } from './editor-render';

interface Op {
  readonly op: string;
  readonly filter: string;
  /** Args registrados p/ `translate` (tx,ty) e `drawImage` (dx,dy,dw,dh). */
  readonly args?: number[];
}

/** Contexto 2D falso: registra `ctx.filter` e args em cada operação. */
function makeMockCtx(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const ctx = {
    filter: 'none',
    fillStyle: '',
    lineWidth: 0,
    strokeStyle: '',
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    arc: () => undefined,
    rect: () => undefined,
    clip: () => undefined,
    clearRect: () => undefined,
    setLineDash: () => undefined,
    fill: () => ops.push({ op: 'fill', filter: ctx.filter }),
    fillRect: () => ops.push({ op: 'fillRect', filter: ctx.filter }),
    stroke: () => ops.push({ op: 'stroke', filter: ctx.filter }),
    translate: (tx: number, ty: number) =>
      ops.push({ op: 'translate', filter: ctx.filter, args: [tx, ty] }),
    rotate: (r: number) =>
      ops.push({ op: 'rotate', filter: ctx.filter, args: [r] }),
    drawImage: (
      _img: unknown,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => ops.push({ op: 'drawImage', filter: ctx.filter, args: [dx, dy, dw, dh] }),
  } as unknown as CanvasRenderingContext2D & { filter: string };
  return { ctx, ops };
}

const LAYOUT: EditorLayout = {
  center: 100,
  pxPerMm: 1,
  bleedR: 80,
  cutR: 70,
  safeR: 60,
};

const IMAGE = {} as HTMLImageElement;

function params(
  ctx: CanvasRenderingContext2D,
  filters?: ImageFilters,
): SceneParams {
  return {
    ctx,
    side: 200,
    layout: LAYOUT,
    image: IMAGE,
    transform: DEFAULT_TRANSFORM,
    drawW: 100,
    drawH: 100,
    filters,
  };
}

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

const BG_IMAGE = { naturalWidth: 200, naturalHeight: 100 } as HTMLImageElement;

describe('editor-render — imagem de fundo', () => {
  it('sem backgroundImage desenha só a arte (1 drawImage)', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene(params(ctx));
    expect(ops.filter((o) => o.op === 'drawImage').length).toBe(1);
  });

  it('com backgroundImage desenha fundo + arte (2 drawImage)', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene({ ...params(ctx), backgroundImage: BG_IMAGE });
    expect(ops.filter((o) => o.op === 'drawImage').length).toBe(2);
  });

  it('o fundo é desenhado ANTES da arte (por baixo)', () => {
    const { ctx, ops } = makeMockCtx();
    // fillRect (cor) → drawImage (fundo) → drawImage (arte)
    drawScene({ ...params(ctx), backgroundImage: BG_IMAGE });
    const firstDraw = ops.findIndex((o) => o.op === 'drawImage');
    const fillRect = ops.findIndex((o) => o.op === 'fillRect');
    expect(fillRect).toBeLessThan(firstDraw);
  });

  it('a cor de base é pintada ANTES do fundo (transparência revela a cor)', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene({ ...params(ctx), backgroundImage: BG_IMAGE });
    const fillRect = ops.findIndex((o) => o.op === 'fillRect');
    const bgDraw = ops.findIndex((o) => o.op === 'drawImage');
    expect(fillRect).toBeLessThan(bgDraw);
  });

  it('aplica o backgroundTransform (translate em center+offset) ao fundo', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene({
      ...params(ctx),
      image: null, // isola o fundo (a arte também usa translate)
      backgroundImage: BG_IMAGE,
      backgroundTransform: { offset: { x: 12, y: -8 }, scale: 1, rotation: 15 },
      bgDrawW: 240,
      bgDrawH: 120,
    });
    const translate = ops.find((o) => o.op === 'translate');
    // center = layout.center = 100
    expect(translate?.args).toEqual([112, 92]);
    const draw = ops.find((o) => o.op === 'drawImage');
    // desenhado centrado no tamanho passado (bgDrawW/bgDrawH)
    expect(draw?.args).toEqual([-120, -60, 240, 120]);
  });

  it('sem backgroundTransform desenha o fundo em COVER (neutro)', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene({ ...params(ctx), image: null, backgroundImage: BG_IMAGE });
    // COVER de 200×100 no diâmetro 160 (bleedR*2): base = 160/100 = 1.6 →
    // 320×160, centrado em 100 → [-160,-80,320,160]. translate no centro exato.
    const translate = ops.find((o) => o.op === 'translate');
    expect(translate?.args).toEqual([100, 100]);
    const draw = ops.find((o) => o.op === 'drawImage');
    expect(draw?.args).toEqual([-160, -80, 320, 160]);
  });
});

describe('editor-render — filtros', () => {
  it('aplica o filtro APENAS na imagem e restaura antes das guias', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene(params(ctx, VIVID));

    const drawImage = ops.find((o) => o.op === 'drawImage');
    expect(drawImage?.filter).toBe('brightness(1) contrast(1.15) saturate(1.4)');

    // O primeiro traço de guia acontece após restaurar para 'none'.
    const firstStroke = ops.find((o) => o.op === 'stroke');
    expect(firstStroke?.filter).toBe('none');
  });

  it('o fundo neutro (fillRect) nunca recebe filtro', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene(params(ctx, VIVID));
    expect(ops.find((o) => o.op === 'fillRect')?.filter).toBe('none');
  });

  it('sem filtros (não-regressão) mantém ctx.filter em none o tempo todo', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene(params(ctx, undefined));
    expect(ops.every((o) => o.filter === 'none')).toBe(true);
    expect(ctx.filter).toBe('none');
  });

  it('filtros default também não tocam ctx.filter', () => {
    const { ctx, ops } = makeMockCtx();
    drawScene(
      params(ctx, {
        brightness: 1,
        contrast: 1,
        saturate: 1,
        effect: 'none',
      }),
    );
    expect(ops.every((o) => o.filter === 'none')).toBe(true);
  });
});
