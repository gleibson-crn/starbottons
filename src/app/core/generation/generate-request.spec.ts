/**
 * Contrato do corpo enviado à Edge `generate-art` (front → back).
 *
 * Trava o shape do payload (chaves e tipos) e a conversão do offset de PX de
 * tela para MILÍMETROS — que é o que torna o enquadramento independente da
 * resolução do canvas. O server reconstrói o mesmo offset via a matemática
 * mm↔px compartilhada, então esta conversão precisa estar exata.
 */
import type { EditorTransform, PrintSpec } from '../../shared/types';
import { computeLayout } from '../../shared/utils';
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
  backgroundImage: null,
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
      'backgroundImage',
      'backgroundOffset',
      'backgroundRotation',
      'backgroundScale',
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

  it('serializa backgroundImage como null quando não há imagem de fundo', () => {
    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: TRANSFORM,
      editorSide: 440,
    });

    expect(body.options.backgroundImage).toBeNull();
  });

  it('sem fundo: backgroundOffset/Scale/Rotation ficam no neutro', () => {
    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: TRANSFORM,
      editorSide: 440,
    });

    expect(body.options.backgroundOffset).toEqual({ x: 0, y: 0 });
    expect(body.options.backgroundScale).toBe(1);
    expect(body.options.backgroundRotation).toBe(0);
  });

  it('serializa backgroundImage como o PATH do Storage (não a url)', () => {
    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: {
        ...TRANSFORM,
        backgroundImage: {
          path: 'user/bg-123.png',
          url: 'blob:preview',
          source: 'upload',
          offset: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
        },
      },
      editorSide: 440,
    });

    expect(body.options.backgroundImage).toBe('user/bg-123.png');
  });

  it('converte o offset do FUNDO px→mm com o MESMO pxPerMm e repassa scale/rotation', () => {
    const editorSide = 440;
    const { pxPerMm } = computeLayout(SPEC_32, editorSide);

    const body = buildGenerateRequest({
      uploadId: 'up-1',
      sizeMm: 32,
      spec: SPEC_32,
      transform: {
        ...TRANSFORM,
        backgroundImage: {
          path: 'user/bg-123.png',
          url: 'blob:preview',
          source: 'upload',
          offset: { x: 60, y: -24 },
          scale: 2,
          rotation: 45,
        },
      },
      editorSide,
    });

    expect(body.options.backgroundOffset.x).toBeCloseTo(60 / pxPerMm, 9);
    expect(body.options.backgroundOffset.y).toBeCloseTo(-24 / pxPerMm, 9);
    expect(body.options.backgroundScale).toBe(2);
    expect(body.options.backgroundRotation).toBe(45);
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
