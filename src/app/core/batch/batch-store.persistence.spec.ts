import { TestBed } from '@angular/core/testing';
import { GenerationGateway, GenerationService } from '../generation';
import { TreatedUploadService, UploadService } from '../upload';
import { BatchPersistenceService } from './batch-persistence.service';
import { BatchStore } from './batch-store.service';
import { newUploadingItem, withUpload } from './batch-item';
import { toSnapshot } from './batch-snapshot';
import type { BatchItem } from './batch.types';

const persistence = {
  available: true,
  currentUserId: vi.fn((): string | null => 'u1'),
  save: vi.fn().mockResolvedValue(undefined),
  load: vi.fn().mockResolvedValue(null),
  clear: vi.fn().mockResolvedValue(undefined),
  putBlob: vi.fn().mockResolvedValue(undefined),
  getBlob: vi.fn().mockResolvedValue(null),
  deleteBlob: vi.fn().mockResolvedValue(undefined),
};
const gateway = {
  fetchAssets: vi.fn().mockResolvedValue([{ kind: 'print_png', storagePath: 'r/x.png' }]),
  signRender: vi.fn().mockResolvedValue('https://signed'),
  signUpload: vi.fn().mockResolvedValue('https://up'),
};

function setup(): BatchStore {
  TestBed.configureTestingModule({
    providers: [
      { provide: BatchPersistenceService, useValue: persistence },
      { provide: GenerationGateway, useValue: gateway },
      { provide: GenerationService, useValue: {} },
      { provide: UploadService, useValue: {} },
      { provide: TreatedUploadService, useValue: {} },
    ],
  });
  return TestBed.inject(BatchStore);
}

function makeItem(id: string): BatchItem {
  const base = newUploadingItem(id, new File(['x'], 'a.png'));
  const upload = {
    id: 'up',
    path: 'u/a.png',
    fileName: 'a.png',
    width: 4000,
    height: 4000,
    previewUrl: '',
  };
  return withUpload(base, upload, { width: 4000, height: 4000, previewUrl: '' }, 9);
}

describe('BatchStore - persistencia (BL-008)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const fn of [
      persistence.save,
      persistence.clear,
      persistence.load,
      persistence.deleteBlob,
    ]) {
      fn.mockClear();
    }
    persistence.currentUserId.mockReturnValue('u1');
  });
  afterEach(() => vi.useRealTimers());

  it('grava o snapshot com debounce de 500ms', async () => {
    const store = setup();
    store.items.set([makeItem('a')]);
    TestBed.tick();
    store.items.set([makeItem('a'), makeItem('b')]);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(400);
    expect(persistence.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(persistence.save).toHaveBeenCalledTimes(1);
    expect(persistence.save.mock.calls[0][0].items).toHaveLength(2);
  });

  it('flushPersist grava ja e cancela o debounce', async () => {
    const store = setup();
    store.items.set([makeItem('a')]);
    TestBed.tick();
    store.flushPersist();
    expect(persistence.save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(persistence.save).toHaveBeenCalledTimes(1);
  });

  it('nao grava lote vazio nem sem usuario', () => {
    const store = setup();
    TestBed.tick();
    store.flushPersist();
    persistence.currentUserId.mockReturnValue(null);
    store.items.set([makeItem('a')]);
    store.flushPersist();
    expect(persistence.save).not.toHaveBeenCalled();
  });

  it('reset limpa o persistido', () => {
    const store = setup();
    store.items.set([makeItem('a')]);
    store.reset();
    expect(persistence.clear).toHaveBeenCalled();
  });

  it('removeItem do ultimo item limpa o persistido e apaga o blob', () => {
    const store = setup();
    store.items.set([makeItem('a')]);
    store.removeItem('a');
    expect(persistence.deleteBlob).toHaveBeenCalledWith('a');
    expect(persistence.clear).toHaveBeenCalled();
  });

  it('restore reconstroi o lote re-assinando artes', async () => {
    const store = setup();
    const withReady: BatchItem = {
      ...makeItem('a'),
      arts: { 32: { status: 'ready', printPngUrl: null, jobId: 'j1', errorMessage: null } },
    };
    await store.restore(toSnapshot([withReady], 'batch-1', 'u1'));
    const [restored] = store.items();
    expect(restored.arts[32]?.status).toBe('ready');
    expect(restored.arts[32]?.printPngUrl).toBe('https://signed');
    expect(restored.previewUrl).toBe('https://up');
  });

  it('loadResumable devolve null se ja ha trabalho', async () => {
    const store = setup();
    store.items.set([makeItem('a')]);
    expect(await store.loadResumable()).toBeNull();
    expect(persistence.load).not.toHaveBeenCalled();
  });
});
