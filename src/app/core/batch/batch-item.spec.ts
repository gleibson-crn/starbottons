import {
  DEFAULT_FILTERS,
  DEFAULT_STYLE_EFFECT,
  type ImageFilters,
  type StyleEffect,
  type UploadRecord,
} from '../../shared/types';
import {
  newUploadingItem,
  withAiStyle,
  withFacePreview,
  withFilters,
  withGenerationUpload,
  withStyle,
} from './batch-item';

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

const TREATED = { id: 'treated-1' } as UploadRecord;

function file(): File {
  return new File([new Uint8Array([1])], 'foto.png', { type: 'image/png' });
}

describe('batch-item — filtros', () => {
  it('novo item nasce com filtros neutros e sem upload tratado', () => {
    const item = newUploadingItem('i1', file());
    expect(item.filters).toEqual(DEFAULT_FILTERS);
    expect(item.generationUpload).toBeNull();
  });

  it('withFilters aplica os filtros de forma imutável', () => {
    const item = newUploadingItem('i1', file());
    const next = withFilters(item, VIVID);
    expect(next).not.toBe(item);
    expect(item.filters).toEqual(DEFAULT_FILTERS);
    expect(next.filters).toEqual(VIVID);
  });

  it('withFilters invalida o upload tratado em cache (fica stale)', () => {
    const base = withGenerationUpload(newUploadingItem('i1', file()), TREATED);
    expect(base.generationUpload).toBe(TREATED);

    const changed = withFilters(base, VIVID);
    expect(changed.generationUpload).toBeNull();
  });

  it('withGenerationUpload guarda o tratado sem mutar o item original', () => {
    const item = withFilters(newUploadingItem('i1', file()), VIVID);
    const next = withGenerationUpload(item, TREATED);
    expect(next).not.toBe(item);
    expect(item.generationUpload).toBeNull();
    expect(next.generationUpload).toBe(TREATED);
  });
});

describe('batch-item — prévia da face (card do lote)', () => {
  it('novo item nasce sem prévia', () => {
    expect(newUploadingItem('i1', file()).facePreview).toBeUndefined();
  });

  it('withFacePreview guarda o dataURL e null o limpa', () => {
    const data = 'data:image/png;base64,AAAA';
    const withIt = withFacePreview(newUploadingItem('i1', file()), data);
    expect(withIt.facePreview).toBe(data);
    expect(withFacePreview(withIt, null).facePreview).toBeUndefined();
  });
});

describe('batch-item — estilo por IA (Trilha 2)', () => {
  const POSTER: StyleEffect = { kind: 'posterize', levels: 4 };

  it('novo item nasce sem estilização por IA', () => {
    expect(newUploadingItem('i1', file()).aiStyled).toBe(false);
  });

  it('withAiStyle marca aiStyled, adota o upload tratado e zera filtros/estilo', () => {
    const dirty = withStyle(withFilters(newUploadingItem('i1', file()), VIVID), POSTER);
    const styled = withAiStyle(dirty, TREATED);

    expect(styled.aiStyled).toBe(true);
    expect(styled.generationUpload).toBe(TREATED);
    expect(styled.filters).toEqual(DEFAULT_FILTERS);
    expect(styled.style).toEqual(DEFAULT_STYLE_EFFECT);
    // Imutável.
    expect(dirty.aiStyled).toBe(false);
  });

  it('withFilters reseta aiStyled e o upload (reprocessa se o usuário mexer)', () => {
    const styled = withAiStyle(newUploadingItem('i1', file()), TREATED);
    const changed = withFilters(styled, VIVID);
    expect(changed.aiStyled).toBe(false);
    expect(changed.generationUpload).toBeNull();
  });

  it('withStyle também reseta aiStyled e o upload', () => {
    const styled = withAiStyle(newUploadingItem('i1', file()), TREATED);
    const changed = withStyle(styled, POSTER);
    expect(changed.aiStyled).toBe(false);
    expect(changed.generationUpload).toBeNull();
  });
});
