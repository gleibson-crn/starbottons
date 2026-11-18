import { restoreItems, type RestoreGateway } from './batch-restore';
import { fromSnapshot, toSnapshot } from './batch-snapshot';
import { newUploadingItem, withArt, withUpload } from './batch-item';
import type { BatchItem } from './batch.types';

function uploaded(id: string): BatchItem {
  const base = newUploadingItem(id, new File(['x'], 'logo.png'));
  const upload = {
    id: `up-${id}`,
    path: `u/${id}.png`,
    fileName: 'logo.png',
    width: 4000,
    height: 4000,
    previewUrl: '',
  };
  return withUpload(base, upload, { width: 4000, height: 4000, previewUrl: '' }, 9);
}

function persisted(items: BatchItem[]): BatchItem[] {
  return fromSnapshot(toSnapshot(items, 'b', 'u'));
}

function gateway(over: Partial<RestoreGateway> = {}): RestoreGateway {
  return {
    fetchAssets: () => Promise.resolve([{ kind: 'print_png', storagePath: 'r/x.png' }]),
    signRender: (p) => Promise.resolve(`https://signed/${p}`),
    signUpload: (p) => Promise.resolve(`https://up/${p}`),
    ...over,
  };
}

const noBlob = (): Promise<Blob | null> => Promise.resolve(null);

describe('restoreItems', () => {
  const ready = withArt(uploaded('a'), 32, { status: 'ready', jobId: 'j1' });

  it('re-assina a arte pronta e o preview do original', async () => {
    const res = await restoreItems(persisted([ready]), { gateway: gateway(), getBlob: noBlob });
    const item = res.items[0];
    expect(item.arts[32]).toEqual({
      status: 'ready',
      printPngUrl: 'https://signed/r/x.png',
      jobId: 'j1',
      errorMessage: null,
    });
    expect(item.previewUrl).toBe('https://up/u/a.png');
    expect(item.upload?.previewUrl).toBe('https://up/u/a.png');
  });

  it('falha ao assinar -> arte idle sem jobId, item mantido', async () => {
    const gw = gateway({ signRender: () => Promise.resolve(null) });
    const res = await restoreItems(persisted([ready]), { gateway: gw, getBlob: noBlob });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].arts[32]).toEqual({
      status: 'idle',
      printPngUrl: null,
      jobId: null,
      errorMessage: null,
    });
  });

  it('excecao no fetchAssets nao trava -> idle', async () => {
    const gw = gateway({ fetchAssets: () => Promise.reject(new Error('rede')) });
    const res = await restoreItems(persisted([ready]), { gateway: gw, getBlob: noBlob });
    expect(res.items[0].arts[32]?.status).toBe('idle');
    expect(res.items[0].arts[32]?.jobId).toBeNull();
  });

  it('asset print_png ausente -> idle', async () => {
    const gw = gateway({ fetchAssets: () => Promise.resolve([]) });
    const res = await restoreItems(persisted([ready]), { gateway: gw, getBlob: noBlob });
    expect(res.items[0].arts[32]?.status).toBe('idle');
  });

  it('item sem upload: usa o Blob; sem Blob e descartado', async () => {
    const pending = newUploadingItem('p', new File(['x'], 'p.png'));
    const gone = newUploadingItem('q', new File(['x'], 'q.png'));
    const blob = new Blob(['abc'], { type: 'image/png' });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored');
    const res = await restoreItems(persisted([pending, gone]), {
      gateway: gateway(),
      getBlob: (id) => Promise.resolve(id === 'p' ? blob : null),
    });
    expect(res.items.map((i) => i.id)).toEqual(['p']);
    expect(res.items[0].previewUrl).toBe('blob:restored');
    expect(res.files.get('p')?.name).toBe('p.png');
  });
});
