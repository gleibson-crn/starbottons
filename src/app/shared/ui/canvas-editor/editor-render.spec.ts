import { DEFAULT_TRANSFORM } from '../../types';
import type { ImageFilters } from '../../types';
import type { EditorLayout } from '../../utils';
import { drawScene, type SceneParams } from './editor-render';

interface Op {
  readonly op: string;
  readonly filter: string;
}

/** Contexto 2D falso: registra o valor de `ctx.filter` em cada operação. */
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
    translate: () => undefined,
    rotate: () => undefined,
    drawImage: () => ops.push({ op: 'drawImage', filter: ctx.filter }),
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
