import { DEFAULT_TRANSFORM } from '../../types';
import type { BackgroundImageRef, EditorTransform, FrameImageRef } from '../../types';
import {
  SCALE_MAX,
  SCALE_MIN,
  clearBackgroundImage,
  addFrameImage,
  canAddFrame,
  removeFrameImageAt,
  reorderFrame,
  resetTransform,
  toggleFlipH,
  toggleFlipV,
  updateFrameFramingAt,
  withBackground,
  withBackgroundImage,
  withOffset,
  withRotation,
  withRotationDelta,
  withScale,
  withZoom,
} from './editor-transform';

const BG_REF: BackgroundImageRef = {
  path: 'user/bg-1.png',
  url: 'blob:bg-1',
  source: 'upload',
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
};

const FRAME_REF: FrameImageRef = {
  path: 'user/frame-1.png',
  url: 'blob:frame-1',
  source: 'upload',
  offset: { x: 0, y: 0 },
  scale: 1,
  rotation: 0,
};

const INPUT = { path: FRAME_REF.path, url: FRAME_REF.url, source: FRAME_REF.source } as const;

function ref(path: string): FrameImageRef {
  return { ...FRAME_REF, path };
}

function stack(...paths: string[]): EditorTransform {
  return { ...DEFAULT_TRANSFORM, frameImages: paths.map(ref) };
}

function paths(t: EditorTransform): string[] {
  return t.frameImages.map((f) => f.path);
}

describe('editor-transform', () => {
  it('withOffset acumula deslocamento', () => {
    const t = withOffset(withOffset(DEFAULT_TRANSFORM, 5, -3), 2, 3);
    expect(t.offset).toEqual({ x: 7, y: 0 });
  });

  it('withZoom clampeia no máximo e mínimo', () => {
    expect(withZoom(DEFAULT_TRANSFORM, 1000).scale).toBe(SCALE_MAX);
    expect(withZoom(DEFAULT_TRANSFORM, 0.0001).scale).toBe(SCALE_MIN);
  });

  it('withScale respeita os limites', () => {
    expect(withScale(DEFAULT_TRANSFORM, 3).scale).toBe(3);
    expect(withScale(DEFAULT_TRANSFORM, 99).scale).toBe(SCALE_MAX);
  });

  it('withRotation clampeia a −180..180', () => {
    expect(withRotation(DEFAULT_TRANSFORM, 400).rotation).toBe(180);
    expect(withRotation(DEFAULT_TRANSFORM, -400).rotation).toBe(-180);
  });

  it('withRotationDelta soma e clampeia', () => {
    expect(withRotationDelta({ ...DEFAULT_TRANSFORM, rotation: 178 }, 5).rotation).toBe(180);
  });

  it('resetTransform zera ajuste mas preserva a COR de fundo', () => {
    const custom = {
      offset: { x: 9, y: 9 },
      scale: 3,
      rotation: 45,
      background: '#ff0000',
      backgroundImage: null,
    };
    const reset = resetTransform(custom);
    expect(reset.offset).toEqual({ x: 0, y: 0 });
    expect(reset.scale).toBe(1);
    expect(reset.rotation).toBe(0);
    expect(reset.background).toBe('#ff0000');
  });

  it('resetTransform preserva a IMAGEM de fundo (é fundo, não enquadramento)', () => {
    const custom = withBackgroundImage(
      { ...DEFAULT_TRANSFORM, scale: 4, offset: { x: 5, y: 5 } },
      BG_REF,
    );
    const reset = resetTransform(custom);
    expect(reset.scale).toBe(1);
    expect(reset.offset).toEqual({ x: 0, y: 0 });
    expect(reset.backgroundImage).toEqual(BG_REF);
  });

  it('toggleFlipH/V invertem só o seu eixo (e voltam)', () => {
    const h = toggleFlipH(DEFAULT_TRANSFORM);
    expect(h.flipH).toBe(true);
    expect(h.flipV).toBe(false);
    expect(toggleFlipH(h).flipH).toBe(false);
    const v = toggleFlipV(h);
    expect(v.flipV).toBe(true);
    expect(v.flipH).toBe(true);
    expect(toggleFlipV(v).flipV).toBe(false);
  });

  it('toggleFlip funciona em transform legado sem os campos', () => {
    const legacy = { ...DEFAULT_TRANSFORM } as Partial<EditorTransform>;
    delete (legacy as { flipH?: boolean }).flipH;
    expect(toggleFlipH(legacy as EditorTransform).flipH).toBe(true);
  });

  it('resetTransform limpa o espelhamento', () => {
    const flipped = toggleFlipV(toggleFlipH(DEFAULT_TRANSFORM));
    const reset = resetTransform(flipped);
    expect(reset.flipH).toBe(false);
    expect(reset.flipV).toBe(false);
  });

  it('withBackground troca apenas a cor', () => {
    expect(withBackground(DEFAULT_TRANSFORM, '#123456').background).toBe('#123456');
  });

  it('withBackgroundImage define a imagem de fundo', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, BG_REF);
    expect(t.backgroundImage).toEqual(BG_REF);
  });

  it('withBackgroundImage inicializa o enquadramento neutro se não vier', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, {
      path: 'user/x.png',
      url: 'blob:x',
      source: 'upload',
    });
    expect(t.backgroundImage?.offset).toEqual({ x: 0, y: 0 });
    expect(t.backgroundImage?.scale).toBe(1);
    expect(t.backgroundImage?.rotation).toBe(0);
  });

  it('withBackgroundImage preserva o enquadramento quando informado', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, {
      path: 'user/x.png',
      url: 'blob:x',
      source: 'upload',
      offset: { x: 12, y: -5 },
      scale: 1.5,
      rotation: 20,
    });
    expect(t.backgroundImage?.offset).toEqual({ x: 12, y: -5 });
    expect(t.backgroundImage?.scale).toBe(1.5);
    expect(t.backgroundImage?.rotation).toBe(20);
  });

  it('resetTransform genérico zera um Framing de fundo', () => {
    const framing = { offset: { x: 9, y: -3 }, scale: 2.5, rotation: 40 };
    const reset = resetTransform(framing);
    expect(reset).toEqual({ offset: { x: 0, y: 0 }, scale: 1, rotation: 0 });
  });

  it('clearBackgroundImage volta para null (usa só a cor)', () => {
    const t = withBackgroundImage(DEFAULT_TRANSFORM, BG_REF);
    expect(clearBackgroundImage(t).backgroundImage).toBeNull();
  });

  it('addFrameImage empilha com enquadramento neutro', () => {
    const t = addFrameImage(DEFAULT_TRANSFORM, INPUT);
    expect(t.frameImages).toEqual([FRAME_REF]);
  });

  it('addFrameImage preserva a IMAGEM de fundo e a cor', () => {
    const withBg = withBackgroundImage({ ...DEFAULT_TRANSFORM, background: '#123456' }, BG_REF);
    const t = addFrameImage(withBg, INPUT);
    expect(t.backgroundImage).toEqual(BG_REF);
    expect(t.background).toBe('#123456');
  });

  it('addFrameImage mantém a ordem e aceita até 3 molduras', () => {
    let t = addFrameImage(DEFAULT_TRANSFORM, { ...INPUT, path: 'a' });
    t = addFrameImage(t, { ...INPUT, path: 'b' });
    t = addFrameImage(t, { ...INPUT, path: 'c' });
    expect(paths(t)).toEqual(['a', 'b', 'c']);
  });

  it('addFrameImage é no-op na 4ª moldura (teto 3)', () => {
    const full = stack('a', 'b', 'c');
    const t = addFrameImage(full, { ...INPUT, path: 'd' });
    expect(t).toBe(full);
  });

  it('canAddFrame é true abaixo de 3 e false com 3', () => {
    expect(canAddFrame(DEFAULT_TRANSFORM)).toBe(true);
    expect(canAddFrame(stack('a', 'b'))).toBe(true);
    expect(canAddFrame(stack('a', 'b', 'c'))).toBe(false);
  });

  it('removeFrameImageAt remove só a moldura do índice', () => {
    expect(paths(removeFrameImageAt(stack('a', 'b', 'c'), 1))).toEqual(['a', 'c']);
  });

  it('removeFrameImageAt fora da faixa é no-op', () => {
    const t = stack('a');
    expect(removeFrameImageAt(t, 5)).toBe(t);
    expect(removeFrameImageAt(t, -1)).toBe(t);
  });

  it('reorderFrame move a moldura de from para to', () => {
    expect(paths(reorderFrame(stack('a', 'b', 'c'), 0, 2))).toEqual(['b', 'c', 'a']);
    expect(paths(reorderFrame(stack('a', 'b', 'c'), 2, 1))).toEqual(['a', 'c', 'b']);
  });

  it('reorderFrame com índices iguais ou inválidos é no-op', () => {
    const t = stack('a', 'b');
    expect(reorderFrame(t, 1, 1)).toBe(t);
    expect(reorderFrame(t, 0, 2)).toBe(t);
    expect(reorderFrame(t, -1, 0)).toBe(t);
  });

  it('updateFrameFramingAt altera só o enquadramento da moldura indicada', () => {
    const framing = { offset: { x: 4, y: 5 }, scale: 2, rotation: 30 };
    const t = updateFrameFramingAt(stack('a', 'b'), 1, framing);
    expect(t.frameImages[1]).toEqual({ ...ref('b'), ...framing });
    expect(t.frameImages[0]).toEqual(ref('a'));
  });

  it('updateFrameFramingAt fora da faixa é no-op', () => {
    const t = stack('a');
    expect(updateFrameFramingAt(t, 3, { offset: { x: 1, y: 1 }, scale: 1, rotation: 0 })).toBe(t);
  });

  it('resetTransform preserva a MOLDURA (é decoração, não enquadramento)', () => {
    const custom = addFrameImage(
      { ...DEFAULT_TRANSFORM, scale: 4, offset: { x: 5, y: 5 } },
      INPUT,
    );
    const reset = resetTransform(custom);
    expect(reset.scale).toBe(1);
    expect(reset.offset).toEqual({ x: 0, y: 0 });
    expect(reset.frameImages).toEqual([FRAME_REF]);
  });

  it('addFrameImage/canAddFrame: teto 3 por padrão e max configurável', () => {
    let t = DEFAULT_TRANSFORM;
    for (let n = 0; n < 4; n++) {
      t = addFrameImage(t, INPUT);
    }
    expect(t.frameImages.length).toBe(3);
    expect(canAddFrame(t)).toBe(false);
    expect(canAddFrame(t, 8)).toBe(true);
    for (let n = 0; n < 8; n++) {
      t = addFrameImage(t, INPUT, 8);
    }
    expect(t.frameImages.length).toBe(8);
    expect(canAddFrame(t, 8)).toBe(false);
  });
});
