import { sniffImageMime } from './magic-bytes';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];

describe('sniffImageMime', () => {
  it('reconhece PNG pela assinatura', () => {
    expect(sniffImageMime(new Uint8Array(PNG))).toBe('image/png');
  });

  it('reconhece JPEG pela assinatura (FF D8 FF)', () => {
    expect(sniffImageMime(new Uint8Array(JPEG))).toBe('image/jpeg');
  });

  it('rejeita conteúdo não-imagem (ex.: %PDF)', () => {
    expect(sniffImageMime(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it('rejeita PNG truncado (menos bytes que a assinatura)', () => {
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it('rejeita buffer vazio', () => {
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
  });
});
