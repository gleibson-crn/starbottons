import { DEFAULT_TRANSFORM } from '../../shared/types';
import {
  BASE_TARGET_RATIO,
  denormalizeTarget,
  normalizeTarget,
  sceneTargetToTransform,
  targetPxToTransform,
  transformToSceneTarget,
  transformToTargetPx,
} from './scene-target';

const DIMS = { width: 800, height: 600 };

describe('scene-target', () => {
  it('normalizeTarget → frações de largura/altura/menor-lado', () => {
    const n = normalizeTarget({ cx: 400, cy: 300, r: 60, rotation: 30 }, DIMS);
    expect(n.cx).toBeCloseTo(0.5);
    expect(n.cy).toBeCloseTo(0.5);
    expect(n.r).toBeCloseTo(0.1); // 60 / min(800,600)=600
    expect(n.rotation).toBe(30);
  });

  it('normalize ∘ denormalize é identidade (round-trip)', () => {
    const px = { cx: 250, cy: 480, r: 90, rotation: -45 };
    const back = denormalizeTarget(normalizeTarget(px, DIMS), DIMS);
    expect(back.cx).toBeCloseTo(px.cx);
    expect(back.cy).toBeCloseTo(px.cy);
    expect(back.r).toBeCloseTo(px.r);
    expect(back.rotation).toBe(px.rotation);
  });

  it('transform default → alvo centralizado com raio-base', () => {
    const px = transformToTargetPx(DEFAULT_TRANSFORM, DIMS);
    expect(px.cx).toBe(400);
    expect(px.cy).toBe(300);
    expect(px.r).toBeCloseTo(Math.min(800, 600) * BASE_TARGET_RATIO);
  });

  it('transform ↔ targetPx é round-trip', () => {
    const t = { offset: { x: 40, y: -20 }, scale: 1.5, rotation: 25, background: '#fff', backgroundImage: null };
    const back = targetPxToTransform(transformToTargetPx(t, DIMS), DIMS);
    expect(back.offset.x).toBeCloseTo(40);
    expect(back.offset.y).toBeCloseTo(-20);
    expect(back.scale).toBeCloseTo(1.5);
    expect(back.rotation).toBe(25);
  });

  it('transformToSceneTarget ↔ sceneTargetToTransform preserva geometria', () => {
    const t = { offset: { x: 10, y: 30 }, scale: 2, rotation: -10, background: '#fff', backgroundImage: null };
    const n = transformToSceneTarget(t, DIMS);
    const back = sceneTargetToTransform(n, DIMS);
    expect(back.offset.x).toBeCloseTo(10);
    expect(back.offset.y).toBeCloseTo(30);
    expect(back.scale).toBeCloseTo(2);
    expect(back.rotation).toBe(-10);
  });
});
