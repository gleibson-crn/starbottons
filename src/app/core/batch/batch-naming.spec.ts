import {
  artFileBase,
  artFileName,
  isNameValid,
  uniqueFileName,
} from './batch-naming';

describe('isNameValid', () => {
  it('rejeita vazio e só espaços', () => {
    expect(isNameValid('')).toBe(false);
    expect(isNameValid('   ')).toBe(false);
  });

  it('aceita nome com conteúdo', () => {
    expect(isNameValid('Logo')).toBe(true);
  });
});

describe('artFileBase / artFileName', () => {
  it('forma {nome}-{modelo}-{tamanho}mm (exemplo do dono)', () => {
    expect(artFileBase('nomeDaImagem', 32)).toBe('nomeDaImagem-redondo-32mm');
  });

  it('gera .png e .pdf com o mesmo base', () => {
    expect(artFileName('nomeDaImagem', 32, 'png')).toBe('nomeDaImagem-redondo-32mm.png');
    expect(artFileName('nomeDaImagem', 32, 'pdf')).toBe('nomeDaImagem-redondo-32mm.pdf');
  });

  it('sanitiza espaços/acentos preservando hífen', () => {
    expect(artFileBase('Café da Manhã', 58)).toBe('Cafe-da-Manha-redondo-58mm');
  });
});

describe('uniqueFileName — colisão', () => {
  it('sufixa -2, -3 quando nome+tamanho coincidem', () => {
    const used = new Set<string>();
    const base = 'logo-redondo-32mm';
    expect(uniqueFileName(base, 'png', used)).toBe('logo-redondo-32mm.png');
    expect(uniqueFileName(base, 'png', used)).toBe('logo-redondo-32mm-2.png');
    expect(uniqueFileName(base, 'png', used)).toBe('logo-redondo-32mm-3.png');
  });

  it('png e pdf do mesmo base não colidem entre si', () => {
    const used = new Set<string>();
    const base = 'logo-redondo-32mm';
    expect(uniqueFileName(base, 'png', used)).toBe('logo-redondo-32mm.png');
    expect(uniqueFileName(base, 'pdf', used)).toBe('logo-redondo-32mm.pdf');
  });
});
