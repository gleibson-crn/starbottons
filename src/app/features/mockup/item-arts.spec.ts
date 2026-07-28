import type { BackgroundImageRef } from '../../shared/types';
import { bgFraming } from './item-arts';

describe('bgFraming', () => {
  it('null quando não há imagem de fundo', () => {
    expect(bgFraming(null)).toBeNull();
  });

  it('mapeia offset/scale/rotation da referência para um Framing', () => {
    const ref: BackgroundImageRef = {
      path: 'p',
      url: 'blob:x',
      source: 'upload',
      offset: { x: 10, y: -4 },
      scale: 1.3,
      rotation: 12,
    };
    expect(bgFraming(ref)).toEqual({
      offset: { x: 10, y: -4 },
      scale: 1.3,
      rotation: 12,
    });
  });
});
