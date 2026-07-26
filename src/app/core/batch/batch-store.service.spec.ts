import { TestBed } from '@angular/core/testing';
import { GenerationGateway, GenerationService } from '../generation';
import { UploadService, type ImageProbe } from '../upload';
import type { GenerateOptionsBody, GenerationResult, UploadRecord } from '../../shared/types';
import { BatchStore } from './batch-store.service';
import { deriveItemStatus } from './batch-gating';
import { artFileName } from './batch-naming';
import type { BatchItem } from './batch.types';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface FakeUpload {
  dims: { width: number; height: number };
  probe(): Promise<ImageProbe>;
  upload(): Promise<UploadRecord>;
}

interface InsertedJob {
  jobId: string;
  sizeMm: number;
  batchId: string | null;
}

interface FakeGateway {
  inserted: InsertedJob[];
  insertQueuedJob(input: InsertedJob): Promise<void>;
}

interface FakeGen {
  calls: number;
  lastJobId?: string;
  behavior: (req: GenerateOptionsBody) => Promise<GenerationResult>;
  generate(req: GenerateOptionsBody, opts: { jobId?: string }): Promise<GenerationResult>;
}

const okResult = (): Promise<GenerationResult> =>
  Promise.resolve({ jobId: 'srv', printPngUrl: 'png', printPdfUrl: 'pdf' });

function makeUpload(): FakeUpload {
  let n = 0;
  const fake: FakeUpload = {
    dims: { width: 4000, height: 4000 },
    probe: () => Promise.resolve({ ...fake.dims, previewUrl: 'about:blank' }),
    upload: () =>
      Promise.resolve({
        id: `up-${++n}`,
        path: 'p',
        fileName: 'logo.png',
        width: fake.dims.width,
        height: fake.dims.height,
        previewUrl: 'about:blank',
      }),
  };
  return fake;
}

function makeGateway(): FakeGateway {
  const fake: FakeGateway = {
    inserted: [],
    insertQueuedJob: (input) => {
      fake.inserted.push({ jobId: input.jobId, sizeMm: input.sizeMm, batchId: input.batchId });
      return Promise.resolve();
    },
  };
  return fake;
}

function makeGen(): FakeGen {
  const fake: FakeGen = {
    calls: 0,
    lastJobId: undefined,
    behavior: okResult,
    generate: (req, opts) => {
      fake.calls++;
      fake.lastJobId = opts.jobId;
      return fake.behavior(req);
    },
  };
  return fake;
}

interface Ctx {
  store: BatchStore;
  upload: FakeUpload;
  gateway: FakeGateway;
  gen: FakeGen;
}

function setup(): Ctx {
  const upload = makeUpload();
  const gateway = makeGateway();
  const gen = makeGen();
  TestBed.configureTestingModule({
    providers: [
      BatchStore,
      { provide: UploadService, useValue: upload },
      { provide: GenerationGateway, useValue: gateway },
      { provide: GenerationService, useValue: gen },
    ],
  });
  return { store: TestBed.inject(BatchStore), upload, gateway, gen };
}

function pngFile(name = 'logo.png'): File {
  return new File([new Uint8Array([1])], name, { type: 'image/png' });
}

async function addImage(ctx: Ctx, dims: { width: number; height: number }): Promise<BatchItem> {
  ctx.upload.dims = dims;
  ctx.store.addFiles([pngFile()]);
  await flush();
  const items = ctx.store.items();
  return items[items.length - 1];
}

describe('BatchStore — gating por tamanho', () => {
  it('imagem pequena: 58mm fica bloqueado e fora da seleção default', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 400, height: 400 });

    expect(item.perSizeTier[58]).toBe('blocked');
    expect(item.perSizeTier[32]).not.toBe('blocked');
    expect(item.selectedSizes.has(58)).toBe(false);
    expect(item.selectedSizes.has(32)).toBe(true);
    expect(item.selectedSizes.has(44)).toBe(true);
  });

  it('toggle não marca tamanho bloqueado', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 400, height: 400 });

    ctx.store.toggleSize(item.id, 58);

    expect(ctx.store.items()[0].selectedSizes.has(58)).toBe(false);
  });

  it('imagem grande: os três tamanhos são geráveis', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });

    expect(item.selectedSizes.size).toBe(3);
    expect(ctx.store.totalArtes()).toBe(3);
  });
});

describe('BatchStore — limite total de artes', () => {
  it('atinge o teto de 75 e bloqueia marcar novos tamanhos', async () => {
    const ctx = setup();
    ctx.upload.dims = { width: 4000, height: 4000 };
    ctx.store.addFiles(Array.from({ length: 25 }, () => pngFile()));
    await flush();

    expect(ctx.store.totalArtes()).toBe(75);
    expect(ctx.store.capped()).toBe(true);
    expect(ctx.store.remainingArtes()).toBe(0);

    const first = ctx.store.items()[0];
    ctx.store.toggleSize(first.id, 32); // desmarca → 74
    expect(ctx.store.capped()).toBe(false);
    ctx.store.toggleSize(first.id, 32); // remarca → 75
    expect(ctx.store.items()[0].selectedSizes.has(32)).toBe(true);
  });
});

describe('BatchStore — nome obrigatório', () => {
  it('bloqueia "Gerar tudo" quando uma imagem selecionada está sem nome', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });

    expect(ctx.store.podeGerar()).toBe(true);
    ctx.store.setName(item.id, '   ');
    expect(ctx.store.nameMissing()).toBe(true);
    expect(ctx.store.podeGerar()).toBe(false);

    ctx.store.setName(item.id, 'Minha Arte');
    expect(ctx.store.nameMissing()).toBe(false);
    expect(ctx.store.podeGerar()).toBe(true);
  });

  it('nome forma o arquivo {nome}-redondo-{tam}mm.ext', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });
    ctx.store.setName(item.id, 'nomeDaImagem');

    const named = ctx.store.items()[0];
    expect(artFileName(named.name, 32, 'png')).toBe('nomeDaImagem-redondo-32mm.png');
    expect(artFileName(named.name, 32, 'pdf')).toBe('nomeDaImagem-redondo-32mm.pdf');
  });
});

describe('BatchStore — geração', () => {
  it('pré-insere com batch_id e usa o mesmo jobId externo no service', async () => {
    const ctx = setup();
    await addImage(ctx, { width: 4000, height: 4000 });

    await ctx.store.generateAll();

    expect(ctx.gateway.inserted.length).toBe(3);
    expect(ctx.gen.calls).toBe(3);
    const batchIds = new Set(ctx.gateway.inserted.map((j) => j.batchId));
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toBeTruthy();
    expect(ctx.gen.lastJobId).toBe(ctx.gateway.inserted.at(-1)?.jobId);
    expect(ctx.store.artesProntas()).toBe(3);
  });

  it('deriva status done quando todas as artes ficam prontas', async () => {
    const ctx = setup();
    await addImage(ctx, { width: 4000, height: 4000 });

    await ctx.store.generateAll();

    expect(deriveItemStatus(ctx.store.items()[0])).toBe('done');
  });

  it('isola falhas: 58mm falha, demais prontas → status partial + contadores', async () => {
    const ctx = setup();
    await addImage(ctx, { width: 4000, height: 4000 });
    ctx.gen.behavior = (req) =>
      req.size_mm === 58
        ? Promise.reject(new Error('render quebrou'))
        : Promise.resolve({ jobId: 'srv', printPngUrl: 'png', printPdfUrl: 'pdf' });

    await ctx.store.generateAll();

    expect(ctx.store.artesProntas()).toBe(2);
    expect(ctx.store.artesFalhas()).toBe(1);
    expect(deriveItemStatus(ctx.store.items()[0])).toBe('partial');
  });
});
