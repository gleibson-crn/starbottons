import { TestBed } from '@angular/core/testing';
import { GenerationGateway, GenerationService } from '../generation';
import { TreatedUploadService, UploadService } from '../upload';
import type { GenerateOptionsBody } from '../../shared/types';
import { BatchStore } from './batch-store.service';
import { EVENT_TALLY_KEY, EventTallyService } from './event-tally.service';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const pngFile = (name = 'logo.png'): File =>
  new File([new Uint8Array([1])], name, { type: 'image/png' });

const labels: (string | null | undefined)[] = [];

function setup(): BatchStore {
  labels.length = 0;
  let n = 0;
  TestBed.configureTestingModule({
    providers: [
      BatchStore,
      {
        provide: UploadService,
        useValue: {
          probe: () => Promise.resolve({ width: 4000, height: 4000, previewUrl: 'about:blank' }),
          upload: () =>
            Promise.resolve({ id: `up-${++n}`, path: 'p', fileName: 'a.png', width: 4000, height: 4000, previewUrl: 'about:blank' }),
        },
      },
      { provide: GenerationGateway, useValue: { insertQueuedJob: () => Promise.resolve() } },
      {
        provide: GenerationService,
        useValue: {
          generate: (req: GenerateOptionsBody) => {
            labels.push(req.options.sequenceLabel);
            return Promise.resolve({ jobId: 'srv', printPngUrl: 'png' });
          },
        },
      },
      {
        provide: TreatedUploadService,
        useValue: {
          createTreatedUploadFromUrl: () =>
            Promise.resolve({ id: 't', path: 't', fileName: 't.png', width: 4000, height: 4000, previewUrl: 'about:blank' }),
        },
      },
    ],
  });
  return TestBed.inject(BatchStore);
}

beforeEach(() => localStorage.removeItem(EVENT_TALLY_KEY));

describe('BatchStore — número (senha) manual (eventos)', () => {
  it('campo nasce VAZIO (sem auto 1..N)', async () => {
    const store = setup();
    store.addFiles([pngFile('a.png'), pngFile('b.png')]);
    await flush();
    expect(store.items().map((i) => i.seqLabel)).toEqual(['', '']);
  });

  it('setSeqLabel sanitiza: só dígitos, máx. 8', async () => {
    const store = setup();
    store.addFiles([pngFile()]);
    await flush();
    store.setSeqLabel(store.items()[0].id, 'a1-2b3 4567890');
    expect(store.items()[0].seqLabel).toBe('12345678');
  });

  it('numbered é false por padrão; reset zera numbered', async () => {
    const store = setup();
    expect(store.numbered()).toBe(false);
    store.numbered.set(true);
    store.addFiles([pngFile()]);
    await flush();
    store.reset();
    expect(store.numbered()).toBe(false);
  });

  it('numbered + preenchido → sequenceLabel = seqLabel', async () => {
    const store = setup();
    store.addFiles([pngFile('a.png'), pngFile('b.png')]);
    await flush();
    store.numbered.set(true);
    store.items().forEach((it, n) => store.setSeqLabel(it.id, String(100 + n)));
    await store.generateAll();
    expect(new Set(labels)).toEqual(new Set(['100', '101']));
  });

  it('não numerado → sequenceLabel null mesmo com seqLabel', async () => {
    const store = setup();
    store.addFiles([pngFile('a.png')]);
    await flush();
    store.setSeqLabel(store.items()[0].id, '7');
    await store.generateAll();
    expect(labels.length).toBeGreaterThan(0);
    expect(new Set(labels)).toEqual(new Set([null]));
  });

  it('numbered com número vazio bloqueia Gerar tudo', async () => {
    const store = setup();
    store.addFiles([pngFile('a.png')]);
    await flush();
    store.numbered.set(true);
    expect(store.seqMissing()).toBe(true);
    expect(store.podeGerar()).toBe(false);
    await store.generateAll();
    expect(labels).toHaveLength(0);
    store.setSeqLabel(store.items()[0].id, '5');
    expect(store.seqMissing()).toBe(false);
    expect(store.podeGerar()).toBe(true);
  });

  it('detecta duplicatas (ignora vazios)', async () => {
    const store = setup();
    store.addFiles([pngFile('a.png'), pngFile('b.png'), pngFile('c.png')]);
    await flush();
    const [a, b] = store.items();
    store.setSeqLabel(a.id, '9');
    store.setSeqLabel(b.id, '9');
    expect([...store.duplicateSeqLabels()]).toEqual(['9']);
    store.setSeqLabel(b.id, '8');
    expect(store.duplicateSeqLabels().size).toBe(0);
  });

  it('arte pronta registra a senha no contador do evento (idempotente)', async () => {
    const store = setup();
    const tally = TestBed.inject(EventTallyService);
    store.addFiles([pngFile('a.png')]);
    await flush();
    store.numbered.set(true);
    store.setSeqLabel(store.items()[0].id, '42');
    await store.generateAll();
    expect(tally.count()).toBe(1);
    expect(tally.produced().has('42')).toBe(true);
  });
});
