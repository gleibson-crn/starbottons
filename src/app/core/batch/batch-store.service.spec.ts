import { TestBed } from '@angular/core/testing';
import { GenerationGateway, GenerationService } from '../generation';
import { TreatedUploadService, UploadService, type ImageProbe } from '../upload';
import type {
  GenerateOptionsBody,
  GenerationResult,
  ImageFilters,
  UploadRecord,
} from '../../shared/types';
import { BatchStore } from './batch-store.service';
import { deriveItemStatus } from './batch-gating';
import { artFileName } from './batch-naming';
import type { BatchItem } from './batch.types';

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

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
  uploadIds: string[];
  behavior: (req: GenerateOptionsBody) => Promise<GenerationResult>;
  generate(req: GenerateOptionsBody, opts: { jobId?: string }): Promise<GenerationResult>;
}

interface TreatedCall {
  previewUrl: string;
  filters: ImageFilters;
  sourceName: string;
}

interface FakeTreated {
  calls: TreatedCall[];
  record: UploadRecord;
  createTreatedUploadFromUrl(
    previewUrl: string,
    filters: ImageFilters,
    sourceName: string,
  ): Promise<UploadRecord>;
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
    uploadIds: [],
    behavior: okResult,
    generate: (req, opts) => {
      fake.calls++;
      fake.lastJobId = opts.jobId;
      fake.uploadIds.push(req.upload_id);
      return fake.behavior(req);
    },
  };
  return fake;
}

function makeTreated(): FakeTreated {
  const fake: FakeTreated = {
    calls: [],
    record: {
      id: 'treated-1',
      path: 't',
      fileName: 'logo-tratado.png',
      width: 4000,
      height: 4000,
      previewUrl: 'about:blank',
    },
    createTreatedUploadFromUrl: (previewUrl, filters, sourceName) => {
      fake.calls.push({ previewUrl, filters, sourceName });
      return Promise.resolve(fake.record);
    },
  };
  return fake;
}

interface Ctx {
  store: BatchStore;
  upload: FakeUpload;
  gateway: FakeGateway;
  gen: FakeGen;
  treated: FakeTreated;
}

function setup(): Ctx {
  const upload = makeUpload();
  const gateway = makeGateway();
  const gen = makeGen();
  const treated = makeTreated();
  TestBed.configureTestingModule({
    providers: [
      BatchStore,
      { provide: UploadService, useValue: upload },
      { provide: GenerationGateway, useValue: gateway },
      { provide: GenerationService, useValue: gen },
      { provide: TreatedUploadService, useValue: treated },
    ],
  });
  return { store: TestBed.inject(BatchStore), upload, gateway, gen, treated };
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

  it('toggle marca tamanho 🔴 (permitido sob aviso forte)', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 400, height: 400 });

    // 58mm é 🔴 e não entra por padrão…
    expect(item.perSizeTier[58]).toBe('blocked');
    expect(ctx.store.items()[0].selectedSizes.has(58)).toBe(false);

    // …mas agora o usuário PODE marcá-lo deliberadamente.
    ctx.store.toggleSize(item.id, 58);
    expect(ctx.store.items()[0].selectedSizes.has(58)).toBe(true);
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

describe('BatchStore — imagem sem tamanho selecionado', () => {
  it('bloqueia "Gerar tudo" quando uma imagem com upload está com 0 tamanhos', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });

    expect(ctx.store.podeGerar()).toBe(true);
    expect(ctx.store.itemsSemTamanho()).toBe(0);

    // Desmarca todos os tamanhos → 0 selecionados.
    for (const size of [32, 44, 58] as const) {
      if (ctx.store.items()[0].selectedSizes.has(size)) {
        ctx.store.toggleSize(item.id, size);
      }
    }

    expect(ctx.store.items()[0].selectedSizes.size).toBe(0);
    expect(ctx.store.itemsSemTamanho()).toBe(1);
    expect(ctx.store.podeGerar()).toBe(false);
  });

  it('imagem toda 🔴 nasce sem tamanho, mas PODE ser marcada (aviso forte)', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 100, height: 100 });

    // Todos os tamanhos são 🔴 → nenhum entra por padrão.
    expect(ctx.store.items()[0].perSizeTier[32]).toBe('blocked');
    expect(ctx.store.items()[0].selectedSizes.size).toBe(0);
    expect(ctx.store.itemsSemTamanho()).toBe(1);
    expect(ctx.store.podeGerar()).toBe(false);

    // Política nova: marcar um tamanho 🔴 é permitido (sob responsabilidade).
    ctx.store.toggleSize(item.id, 32);
    expect(ctx.store.items()[0].selectedSizes.has(32)).toBe(true);
    expect(ctx.store.itemsSemTamanho()).toBe(0);
    expect(ctx.store.podeGerar()).toBe(true);
  });
});

describe('BatchStore — started (lote saiu do idle)', () => {
  it('started vira true após iniciar a geração', async () => {
    const ctx = setup();
    await addImage(ctx, { width: 4000, height: 4000 });

    expect(ctx.store.started()).toBe(false);

    await ctx.store.generateAll();

    expect(ctx.store.started()).toBe(true);
    expect(ctx.store.artesProntas()).toBe(3);
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

describe('BatchStore — filtros por item (Abordagem A)', () => {
  it('setItemFilters aplica os filtros no item de forma imutável', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });

    ctx.store.setItemFilters(item.id, VIVID);

    expect(ctx.store.items()[0].filters).toEqual(VIVID);
    expect(ctx.store.items()[0].generationUpload).toBeNull();
  });

  it('SEM filtros não reprocessa: usa o upload ORIGINAL na geração', async () => {
    const ctx = setup();
    await addImage(ctx, { width: 4000, height: 4000 });

    await ctx.store.generateAll();

    expect(ctx.treated.calls.length).toBe(0);
    expect(ctx.gen.calls).toBe(3);
    expect(new Set(ctx.gen.uploadIds)).toEqual(new Set(['up-1']));
  });

  it('COM filtros cria UM upload tratado (novo) e usa ele em todos os tamanhos', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });
    ctx.store.setItemFilters(item.id, VIVID);

    await ctx.store.generateAll();

    // Um único tratado por item, reusado pelas 3 artes (idempotência).
    expect(ctx.treated.calls.length).toBe(1);
    expect(ctx.treated.calls[0].filters).toEqual(VIVID);
    expect(ctx.gen.calls).toBe(3);
    expect(new Set(ctx.gen.uploadIds)).toEqual(new Set(['treated-1']));
    expect(ctx.store.items()[0].generationUpload?.id).toBe('treated-1');
    expect(ctx.store.artesProntas()).toBe(3);
  });

  it('retry reusa o tratado já materializado (não reprocessa)', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });
    ctx.store.setItemFilters(item.id, VIVID);
    ctx.gen.behavior = (req) =>
      req.size_mm === 58
        ? Promise.reject(new Error('falhou'))
        : Promise.resolve({ jobId: 'srv', printPngUrl: 'png', printPdfUrl: 'pdf' });

    await ctx.store.generateAll();
    expect(ctx.treated.calls.length).toBe(1);

    ctx.gen.behavior = okResult;
    await ctx.store.retryItem(item.id);

    // Nenhum reprocessamento adicional: o tratado em cache foi reutilizado.
    expect(ctx.treated.calls.length).toBe(1);
    expect(ctx.store.artesProntas()).toBe(3);
  });

  it('falha ao tratar marca as artes do item como falha (sem quebrar o lote)', async () => {
    const ctx = setup();
    const item = await addImage(ctx, { width: 4000, height: 4000 });
    ctx.store.setItemFilters(item.id, VIVID);
    ctx.treated.createTreatedUploadFromUrl = () =>
      Promise.reject(new Error('canvas indisponível'));

    await ctx.store.generateAll();

    expect(ctx.gen.calls).toBe(0);
    expect(ctx.store.artesFalhas()).toBe(3);
  });
});

describe('BatchStore — reset (novo botton zera o lote)', () => {
  it('reset esvazia os itens do lote', async () => {
    const ctx = setup();
    await addImage(ctx, { width: 4000, height: 4000 });
    await addImage(ctx, { width: 4000, height: 4000 });
    expect(ctx.store.items().length).toBe(2);

    ctx.store.reset();

    expect(ctx.store.items().length).toBe(0);
    expect(ctx.store.totalArtes()).toBe(0);
  });
});
