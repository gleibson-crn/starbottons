import type { UploadRecord } from '../../shared/types';
import { DEFAULT_FILTERS } from '../../shared/types';
import { needsTreated, sourceUpload, treatSourceUrl } from './batch-generation-helpers';
import { newUploadingItem, withCutout, withFilters, withGenerationUpload } from './batch-item';
import { fromPersistedItem, toSnapshot } from './batch-snapshot';

const rec = (id: string): UploadRecord => ({
  id,
  path: `u/${id}.png`,
  fileName: `${id}.png`,
  width: 100,
  height: 100,
  previewUrl: `blob:${id}`,
});

const base = () => ({
  ...newUploadingItem('a', new File(['x'], 'foto.jpg')),
  upload: rec('orig'),
  previewUrl: 'blob:orig',
  width: 100,
  height: 100,
});

describe('Remover fundo no BatchItem', () => {
  it('withCutout marca cutout, guarda o upload e invalida o tratado', () => {
    const item = withCutout(withGenerationUpload(base(), rec('gen')), rec('cut'));
    expect(item.cutout).toBe(true);
    expect(item.cutoutUpload?.id).toBe('cut');
    expect(item.generationUpload).toBeNull();
    expect(item.upload?.id).toBe('orig'); // original intacto (desfazer)
  });

  it('com recorte, needsTreated é true mesmo sem filtros e sourceUpload usa o tratado', () => {
    const cut = withCutout(base(), rec('cut'));
    expect(needsTreated(cut)).toBe(true);
    expect(() => sourceUpload(cut, rec('orig'))).toThrow();
    expect(sourceUpload(withGenerationUpload(cut, rec('gen')), rec('orig')).id).toBe('gen');
  });

  it('desfazer (null) volta ao original', () => {
    const undone = withCutout(withCutout(base(), rec('cut')), null);
    expect(undone.cutout).toBe(false);
    expect(needsTreated(undone)).toBe(false);
    expect(treatSourceUrl(undone)).toBe('blob:orig');
  });

  it('treatSourceUrl prefere o recorte', () => {
    expect(treatSourceUrl(withCutout(base(), rec('cut')))).toBe('blob:cut');
  });

  it('mudar filtros NÃO zera o recorte (filtros aplicam sobre o recorte)', () => {
    const item = withFilters(withCutout(base(), rec('cut')), { ...DEFAULT_FILTERS, brightness: 120 });
    expect(item.cutout).toBe(true);
    expect(item.cutoutUpload?.id).toBe('cut');
  });

  it('persiste no snapshot (BL-008) e restaura sem previewUrl', () => {
    const item = withCutout(base(), rec('cut'));
    const snap = toSnapshot([item], 'b', 'u');
    expect(snap.items[0].cutoutUpload).toEqual({
      id: 'cut',
      path: 'u/cut.png',
      fileName: 'cut.png',
      width: 100,
      height: 100,
    });
    const restored = fromPersistedItem(snap.items[0]);
    expect(restored.cutout).toBe(true);
    expect(restored.cutoutUpload?.path).toBe('u/cut.png');
    expect(restored.cutoutUpload?.previewUrl).toBe('');
  });

  it('item sem recorte não grava cutoutUpload no snapshot', () => {
    expect('cutoutUpload' in toSnapshot([base()], 'b', 'u').items[0]).toBe(false);
  });
});
