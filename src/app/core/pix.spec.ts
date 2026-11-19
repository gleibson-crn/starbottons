import { crc16, pixPayload } from './pix';

describe('crc16 (CCITT/FALSE)', () => {
  it('valor de verificação canônico: CRC("123456789") = 29B1', () => {
    expect(crc16('123456789')).toBe('29B1');
  });

  it('sempre 4 hex maiúsculos', () => {
    expect(crc16('A')).toMatch(/^[0-9A-F]{4}$/);
    expect(crc16('')).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe('pixPayload (BR Code estático)', () => {
  const params = { key: '05389106407', name: 'Gleibson CRN', city: 'Recife' };

  it('começa com o Payload Format Indicator 000201', () => {
    expect(pixPayload(params).startsWith('000201')).toBe(true);
  });

  it('inclui o GUI do PIX e a chave', () => {
    const out = pixPayload(params);
    expect(out).toContain('br.gov.bcb.pix');
    expect(out).toContain('05389106407');
  });

  it('CRC final confere com o recomputado sobre o resto (roundtrip)', () => {
    const out = pixPayload(params);
    const semCrc = out.slice(0, -4); // tudo menos os 4 hex do CRC (inclui o "6304")
    expect(out.slice(-4)).toBe(crc16(semCrc));
  });

  it('termina com o campo 6304 + CRC (8 chars finais)', () => {
    const out = pixPayload(params);
    expect(out.slice(-8, -4)).toBe('6304');
  });

  it('normaliza nome/cidade para ASCII maiúsculo sem acento', () => {
    const out = pixPayload({ key: 'x', name: 'José Ação', city: 'São Paulo' });
    expect(out).toContain('JOSE ACAO');
    expect(out).toContain('SAO PAULO');
    expect(out).not.toMatch(/[áâãéíóõúç]/i);
  });

  it('TXID padrão é *** quando não informado (bloco 62 = 62070503***)', () => {
    // 62 (dados adicionais) -> 07 -> 05 (ref) -> 03 -> ***
    expect(pixPayload(params)).toContain('62070503***');
  });
});
