import { signal } from '@angular/core';
import { DEFAULT_TRANSFORM, type EditorTransform } from '../../../shared/types';
import type { FrameTemplate } from '../../../core/frames';
import { FrameLayers } from './frame-layers';

const TPL: FrameTemplate = {
  id: 'f1',
  name: 'Borda',
  storagePath: 'u/borda.png',
  mime: 'image/png',
  width: 1000,
  height: 1000,
  createdAt: '2026-08-20T10:00:00Z',
  thumbUrl: 'https://app/borda.png',
  defaultFraming: { offset: { x: 0.1, y: -0.05 }, scale: 1.5, rotation: 20 },
  isComposite: false,
};

const uploads = { probe: async () => ({}), upload: async () => ({}) } as never;

describe('FrameLayers.addTemplate', () => {
  it('denormaliza o enquadramento padrão pelo lado do editor', () => {
    const t = signal<EditorTransform>(DEFAULT_TRANSFORM);
    const layers = new FrameLayers(t, uploads, () => 400);
    layers.addTemplate(TPL);
    const f = layers.framings()[0];
    expect(f.offset.x).toBeCloseTo(40);
    expect(f.offset.y).toBeCloseTo(-20);
    expect(f.scale).toBe(1.5);
    expect(f.rotation).toBe(20);
  });

  it('lado desconhecido (0) → offset 0 (COVER), mantém escala/rotação', () => {
    const t = signal<EditorTransform>(DEFAULT_TRANSFORM);
    const layers = new FrameLayers(t, uploads);
    layers.addTemplate(TPL);
    const f = layers.framings()[0];
    expect(f.offset.x).toBeCloseTo(0);
    expect(f.offset.y).toBeCloseTo(0);
    expect(f.scale).toBe(1.5);
  });
});

describe('FrameLayers — teto e addNeutral', () => {
  const ref = (n: number) => ({ path: `p${n}`, url: `u${n}`, source: 'upload' as const });

  it('sem max, o teto do botton continua 3', () => {
    const t = signal<EditorTransform>(DEFAULT_TRANSFORM);
    const layers = new FrameLayers(t, uploads);
    [1, 2, 3, 4].forEach((n) => layers.addNeutral(ref(n)));
    expect(layers.refs().length).toBe(3);
    expect(layers.canAdd()).toBe(false);
    expect(layers.error()).toBe('Limite de 3 molduras atingido.');
  });

  it('addTemplate respeita o teto 3 por padrão', () => {
    const t = signal<EditorTransform>(DEFAULT_TRANSFORM);
    const layers = new FrameLayers(t, uploads);
    for (let i = 0; i < 5; i++) {
      layers.addTemplate(TPL);
    }
    expect(layers.refs().length).toBe(3);
  });

  it('com max=8 empilha até 8 e a mensagem usa o max', async () => {
    const t = signal<EditorTransform>(DEFAULT_TRANSFORM);
    const layers = new FrameLayers(t, uploads, () => 0, 8);
    for (let n = 1; n <= 9; n++) {
      layers.addNeutral(ref(n));
    }
    expect(layers.refs().length).toBe(8);
    expect(layers.canAdd()).toBe(false);
    expect(layers.error()).toBe('Limite de 8 molduras atingido.');
    await layers.addUpload(new File(['x'], 'a.png'));
    expect(layers.error()).toBe('Limite de 8 molduras atingido.');
  });

  it('addNeutral entra neutra (sem defaultFraming), guarda id/source e fica ativa', () => {
    const t = signal<EditorTransform>(DEFAULT_TRANSFORM);
    const layers = new FrameLayers(t, uploads, () => 400);
    layers.addNeutral({ path: 'c/x.png', url: 'u', source: 'template', id: 'f1' });
    const r = layers.refs()[0];
    expect(r.offset).toEqual({ x: 0, y: 0 });
    expect(r.scale).toBe(1);
    expect(r.rotation).toBe(0);
    expect(r.id).toBe('f1');
    expect(r.source).toBe('template');
    expect(layers.activeIndex()).toBe(0);
  });
});
