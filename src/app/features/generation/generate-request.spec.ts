/**
 * Contrato do corpo enviado à Edge `generate-art` (front → back).
 *
 * Trava o shape do payload (chaves e tipos) e a conversão do offset de PX de
 * tela para MILÍMETROS — que é o que torna o enquadramento independente da
 * resolução do canvas. O server reconstrói o mesmo offset via a matemática
 * mm↔px compartilhada, então esta conversão precisa estar exata.
 */
import type { EditorTransform, PrintSpec } from '../../shared/types';
import { computeLayout } from '../editor/editor-geometry';
import { buildGenerateRequest } from './generate-request';

const SPEC_32: PrintSpec = {
  model: 'round',
  sizeMm: 32,
  visibleMm: 32,
  artDiameterMm: 44,
  bleedMm: 6,
  safeMm: 2,
  dpiTarget: 300,
};

const TRANSFORM: EditorTransform = {
  offset: { x: 100, y: -40 },
  scale: 1.5,
  rotation: 30,
  background: '#112233',
};

describe('buildGenerateRequest', () => {
  it('produz o shape de contrato esperado pela Edge', () => {
    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: TRANSFORM,
      editorSide: 440,
    });

    expect(Object.keys(body).sort()).toEqual(['options', 'shape_key', 'size_mm', 'upload_id']);
    expect(body.shape_key).toBe('round');
    expect(body.size_mm).toBe(32);
    expect(body.upload_id).toBe('up-1');
    expect(Object.keys(body.options).sort()).toEqual([
      'background',
      'fit',
      'offset',
      'rotation',
      'scale',
    ]);
    expect(body.options.fit).toBe('cover');
  });

  it('repassa scale, rotation e background sem alterar', () => {
    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: TRANSFORM,
      editorSide: 440,
    });

    expect(body.options.scale).toBe(1.5);
    expect(body.options.rotation).toBe(30);
    expect(body.options.background).toBe('#112233');
  });

  it('converte o offset de px de tela para milímetros (÷ pxPerMm do layout)', () => {
    const editorSide = 440;
    const { pxPerMm } = computeLayout(SPEC_32, editorSide);

    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: TRANSFORM,
      editorSide,
    });

    expect(body.options.offset.x).toBeCloseTo(100 / pxPerMm, 9);
    expect(body.options.offset.y).toBeCloseTo(-40 / pxPerMm, 9);
  });

  it('não inclui job_id (adicionado só pelo GenerationService)', () => {
    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: TRANSFORM,
      editorSide: 440,
    });

    expect((body as unknown as Record<string, unknown>)['job_id']).toBeUndefined();
  });
});
