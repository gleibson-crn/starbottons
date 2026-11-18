/**
 * CanvasEditor — roteamento de camada dos gestos. Com `layer='background'` e um
 * `backgroundTransform` não-nulo, arrastar/rolar/teclas mutam o FUNDO; senão a
 * ARTE (comportamento histórico). As MESMAS funções de gesto servem às duas
 * camadas. Chamamos os handlers diretamente (sem DOM) — o `canvasRect` cai no
 * fallback quadrado, então k=1.
 */
import { TestBed } from '@angular/core/testing';
import type { Framing, PrintSpec } from '../../types';
import { DEFAULT_BACKGROUND_FRAMING, DEFAULT_TRANSFORM } from '../../types';
import { CanvasEditor } from './canvas-editor';

const SPEC: PrintSpec = {
  model: 'round',
  sizeMm: 32,
  visibleMm: 32,
  artDiameterMm: 44,
  bleedMm: 6,
  safeMm: 2,
  dpiTarget: 300,
};

function make(
  layer: 'art' | 'background' | 'frame',
  bg: Framing | null,
  frames: { framings: readonly Framing[]; active: number } = { framings: [], active: -1 },
): CanvasEditor {
  const fixture = TestBed.createComponent(CanvasEditor);
  fixture.componentRef.setInput('spec', SPEC);
  fixture.componentRef.setInput('transform', DEFAULT_TRANSFORM);
  fixture.componentRef.setInput('layer', layer);
  fixture.componentRef.setInput('backgroundTransform', bg);
  fixture.componentRef.setInput('frameFramings', frames.framings);
  fixture.componentRef.setInput('activeFrameIndex', frames.active);
  return fixture.componentInstance;
}

const wheelUp = { deltaY: -1, preventDefault: () => undefined } as unknown as WheelEvent;
function key(k: string): KeyboardEvent {
  return { key: k, preventDefault: () => undefined } as unknown as KeyboardEvent;
}

describe('CanvasEditor — roteamento de camada', () => {
  it("layer='background' + roda muta backgroundTransform, não o transform", () => {
    const c = make('background', { ...DEFAULT_BACKGROUND_FRAMING });
    c.onWheel(wheelUp);
    expect(c.backgroundTransform()!.scale).toBeGreaterThan(1);
    expect(c.transform().scale).toBe(1);
  });

  it("layer='art' + roda muta o transform, não o fundo", () => {
    const c = make('art', { ...DEFAULT_BACKGROUND_FRAMING });
    c.onWheel(wheelUp);
    expect(c.transform().scale).toBeGreaterThan(1);
    expect(c.backgroundTransform()!.scale).toBe(1);
  });

  it('backgroundTransform null cai na arte mesmo com layer background', () => {
    const c = make('background', null);
    c.onWheel(wheelUp);
    expect(c.transform().scale).toBeGreaterThan(1);
    expect(c.backgroundTransform()).toBeNull();
  });

  it("teclado (ArrowRight) na camada 'background' move o fundo", () => {
    const c = make('background', { ...DEFAULT_BACKGROUND_FRAMING });
    c.onKeydown(key('ArrowRight'));
    expect(c.backgroundTransform()!.offset.x).toBeGreaterThan(0);
    expect(c.transform().offset.x).toBe(0);
  });

  it("teclado (colchete) gira o fundo na camada 'background'", () => {
    const c = make('background', { ...DEFAULT_BACKGROUND_FRAMING });
    c.onKeydown(key(']'));
    expect(c.backgroundTransform()!.rotation).toBeGreaterThan(0);
    expect(c.transform().rotation).toBe(0);
  });

  it('tecla não reconhecida não muta nenhuma camada', () => {
    const c = make('background', { ...DEFAULT_BACKGROUND_FRAMING });
    c.onKeydown(key('x'));
    expect(c.backgroundTransform()).toEqual(DEFAULT_BACKGROUND_FRAMING);
    expect(c.transform()).toEqual(DEFAULT_TRANSFORM);
  });

  it("layer='frame' sem moldura ativa (-1) é INERTE: nada muda nem emite", () => {
    const c = make('frame', { ...DEFAULT_BACKGROUND_FRAMING });
    const emitted: unknown[] = [];
    c.frameFramingChange.subscribe((e) => emitted.push(e));
    c.onWheel(wheelUp);
    c.onKeydown(key('ArrowRight'));
    c.onKeydown(key(']'));
    expect(c.transform()).toEqual(DEFAULT_TRANSFORM);
    expect(c.backgroundTransform()).toEqual(DEFAULT_BACKGROUND_FRAMING);
    expect(emitted).toEqual([]);
  });

  it("layer='frame' com índice válido EMITE frameFramingChange e não muta a arte", () => {
    const c = make('frame', null, {
      framings: [{ ...DEFAULT_BACKGROUND_FRAMING }, { ...DEFAULT_BACKGROUND_FRAMING }],
      active: 1,
    });
    const emitted: { index: number; framing: Framing }[] = [];
    c.frameFramingChange.subscribe((e) => emitted.push(e));
    c.onWheel(wheelUp);
    expect(emitted.length).toBe(1);
    expect(emitted[0].index).toBe(1);
    expect(emitted[0].framing.scale).toBeGreaterThan(1);
    expect(c.transform()).toEqual(DEFAULT_TRANSFORM);
  });

  it("layer='frame' com índice fora da faixa é inerte", () => {
    const c = make('frame', null, { framings: [{ ...DEFAULT_BACKGROUND_FRAMING }], active: 3 });
    const emitted: unknown[] = [];
    c.frameFramingChange.subscribe((e) => emitted.push(e));
    c.onWheel(wheelUp);
    expect(emitted).toEqual([]);
    expect(c.transform()).toEqual(DEFAULT_TRANSFORM);
  });
});
