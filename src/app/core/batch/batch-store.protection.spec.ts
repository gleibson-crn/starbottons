import { TestBed } from '@angular/core/testing';
import { GenerationGateway, GenerationService } from '../generation';
import { TreatedUploadService, UploadService } from '../upload';
import { BatchStore } from './batch-store.service';
import { ZipExportService } from './zip-export.service';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const zipFake = { export: vi.fn() };

function setup(): BatchStore {
  const record = { id: 'up-1', path: 'p', fileName: 'a.png', width: 4000, height: 4000, previewUrl: 'about:blank' };
  TestBed.configureTestingModule({
    providers: [
      BatchStore,
      {
        provide: UploadService,
        useValue: {
          probe: () => Promise.resolve({ width: 4000, height: 4000, previewUrl: 'about:blank' }),
          upload: () => Promise.resolve(record),
        },
      },
      { provide: GenerationGateway, useValue: {} },
      { provide: GenerationService, useValue: {} },
      { provide: TreatedUploadService, useValue: {} },
      { provide: ZipExportService, useValue: zipFake },
    ],
  });
  return TestBed.inject(BatchStore);
}

async function addImage(store: BatchStore): Promise<string> {
  store.addFiles([new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })]);
  await flush();
  return store.items()[0].id;
}

describe('BatchStore — proteção do lote (hasWork / savedToZip / exportZip)', () => {
  it('hasWork é false sem itens e true com qualquer imagem (mesmo sem gerar)', async () => {
    const store = setup();
    expect(store.hasWork()).toBe(false);
    await addImage(store);
    expect(store.started()).toBe(false);
    expect(store.hasWork()).toBe(true);
    store.reset();
    expect(store.hasWork()).toBe(false);
  });

  it('exportZip delega ao ZipExportService e marca savedToZip', async () => {
    const store = setup();
    await addImage(store);
    zipFake.export.mockResolvedValue({ zipped: 2, skippedFailures: 0 });
    expect(store.savedToZip()).toBe(false);
    const result = await store.exportZip();
    expect(result.zipped).toBe(2);
    expect(zipFake.export).toHaveBeenCalledWith(store.items());
    expect(store.savedToZip()).toBe(true);
  });

  it('savedToZip volta a false quando o lote muda', async () => {
    const store = setup();
    const itemId = await addImage(store);
    zipFake.export.mockResolvedValue({ zipped: 1, skippedFailures: 0 });
    await store.exportZip();
    store.setName(itemId, 'outro-nome');
    expect(store.savedToZip()).toBe(false);
  });

  it('exportZip sem arquivos (zipped=0) não marca savedToZip', async () => {
    const store = setup();
    await addImage(store);
    zipFake.export.mockResolvedValue({ zipped: 0, skippedFailures: 0 });
    await store.exportZip();
    expect(store.savedToZip()).toBe(false);
  });
});
