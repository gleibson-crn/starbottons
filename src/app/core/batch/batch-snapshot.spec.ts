import { DEFAULT_TRANSFORM } from '../../shared/types';
import {
  fromSnapshot,
  parseSnapshot,
  SNAPSHOT_TTL_MS,
  summarize,
  toSnapshot,
} from './batch-snapshot';
import { newUploadingItem, withArt, withUpload } from './batch-item';
import type { BatchItem } from './batch.types';

function makeItem(id: string, uploaded = true): BatchItem {
  const base = newUploadingItem(id, new File(['x'], 'logo.png'));
  if (!uploaded) {
    return base;
  }
  const upload = {
    id: `up-${id}`,
    path: `u/${id}.png`,
    fileName: 'logo.png',
    width: 4000,
    height: 4000,
    previewUrl: 'blob:abc',
  };
  return withUpload(base, upload, { width: 4000, height: 4000, previewUrl: 'blob:abc' }, 9);
}

describe('batch-snapshot', () => {
  it('serializa Set como array e descarta URLs/estado derivado', () => {
    let item = makeItem('a');
    item = withArt(item, 32, {
      status: 'ready',
      jobId: 'j1',
      printPngUrl: 'https://signed',
      errorMessage: 'x',
    });
    const snap = toSnapshot([item], 'b1', 'u1', 1000);
    const json = JSON.stringify(snap);
    expect(snap.items[0].selectedSizes).toEqual([32, 44, 58]);
    expect(snap.items[0].upload).toEqual({
      id: 'up-a',
      path: 'u/a.png',
      fileName: 'logo.png',
      width: 4000,
      height: 4000,
    });
    expect(json).not.toContain('blob:abc');
    expect(json).not.toContain('https://signed');
    expect(json).not.toContain('perSizeDpi');
    expect(json).not.toContain('printPngUrl');
    expect(json).not.toContain('errorMessage');
    expect(snap.items[0].arts).toEqual({ 32: { status: 'ready', jobId: 'j1' } });
  });

  it('generating, failed, ready sem jobId e idle nao sao persistidos', () => {
    let item = makeItem('a');
    item = withArt(item, 32, { status: 'generating', jobId: 'j1' });
    item = withArt(item, 44, { status: 'failed', jobId: 'j2' });
    item = withArt(item, 58, { status: 'ready', jobId: null });
    expect(toSnapshot([item], 'b', 'u').items[0].arts).toEqual({});
  });

  it('roundtrip preserva campos e recalcula DPI/tier; arte volta idle com jobId', () => {
    let item = makeItem('a');
    item = withArt(item, 44, { status: 'ready', jobId: 'j9', printPngUrl: 'x' });
    const back = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot([item], 'b', 'u'))))[0];
    expect(back.id).toBe('a');
    expect(back.name).toBe(item.name);
    expect(back.transform).toEqual(DEFAULT_TRANSFORM);
    expect([...back.selectedSizes]).toEqual([...item.selectedSizes]);
    expect(back.perSizeDpi).toEqual(item.perSizeDpi);
    expect(back.perSizeTier).toEqual(item.perSizeTier);
    expect(back.arts[44]).toEqual({
      status: 'idle',
      printPngUrl: null,
      jobId: 'j9',
      errorMessage: null,
    });
    expect(back.previewUrl).toBe('');
    expect(back.generationUpload).toBeNull();
    expect(back.aiStyled).toBe(false);
  });

  it('item sem upload volta com mensagem de envio interrompido', () => {
    const back = fromSnapshot(toSnapshot([makeItem('a', false)], 'b', 'u'))[0];
    expect(back.upload).toBeNull();
    expect(back.uploadError).toContain('Envio interrompido');
  });

  it('parseSnapshot: ok, TTL vencido, outro usuario e invalido', () => {
    const snap = toSnapshot([makeItem('a')], 'b', 'u1', 1000);
    expect(parseSnapshot(snap, 'u1', 1000 + SNAPSHOT_TTL_MS)).not.toBeNull();
    expect(parseSnapshot(snap, 'u1', 1001 + SNAPSHOT_TTL_MS)).toBeNull();
    expect(parseSnapshot(snap, 'u2', 1000)).toBeNull();
    expect(parseSnapshot({ v: 2 }, 'u1')).toBeNull();
    expect(parseSnapshot(null, 'u1')).toBeNull();
  });

  it('summarize conta bottons e artes prontas', () => {
    let item = makeItem('a');
    item = withArt(item, 32, { status: 'ready', jobId: 'j1' });
    item = withArt(item, 44, { status: 'ready', jobId: 'j2' });
    expect(summarize(toSnapshot([item, makeItem('b')], 'b', 'u'))).toEqual({
      total: 2,
      ready: 2,
    });
  });

  it('roundtrip preserva numbered e seqLabel', () => {
    const item = { ...makeItem('a'), seqLabel: '0042' };
    const snap = JSON.parse(JSON.stringify(toSnapshot([item], 'b', 'u', 1000, true)));
    expect(snap.numbered).toBe(true);
    expect(fromSnapshot(snap)[0].seqLabel).toBe('0042');
    expect(toSnapshot([item], 'b', 'u').numbered).toBe(false);
  });

  it('snapshot legado: sequenceNumber (number) vira seqLabel string', () => {
    const snap = toSnapshot([makeItem('a'), makeItem('b')], 'b', 'u');
    const legacy = {
      ...snap,
      items: snap.items.map((it, i) => {
        const rest = { ...it, sequenceNumber: i + 5 } as { seqLabel?: string };
        delete rest.seqLabel;
        return rest as typeof it;
      }),
    };
    expect(fromSnapshot(legacy).map((i) => i.seqLabel)).toEqual(['5', '6']);
  });

  it('snapshot sem nenhum número: seqLabel vazio (sem fallback index+1)', () => {
    const snap = toSnapshot([makeItem('a')], 'b', 'u');
    const bare = { ...snap, items: snap.items.map((it) => ({ ...it, seqLabel: undefined })) };
    expect(fromSnapshot(bare)[0].seqLabel).toBe('');
  });
});
