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

function make(layer: 'art' | 'background', bg: Framing | null): CanvasEditor {
  const fixture = TestBed.createComponent(CanvasEditor);
  fixture.componentRef.setInput('spec', SPEC);
  fixture.componentRef.setInput('transform', DEFAULT_TRANSFORM);
  fixture.componentRef.setInput('layer', layer);
  fixture.componentRef.setInput('backgroundTransform', bg);
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
});
