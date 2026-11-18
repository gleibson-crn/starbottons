import { TestBed } from '@angular/core/testing';
import type {
  AssetRecord,
  GatewayResponse,
  GenerateOptionsBody,
  GenerationJob,
} from '../../shared/types';
import { GenerationGateway } from './generation.gateway';
import { GenerationService } from './generation.service';
import { GenerationTimeoutError } from './generation-timeout.error';

const REQUEST: GenerateOptionsBody = {
  upload_id: 'u1',
  shape_key: 'round',
  size_mm: 32,
  options: {
    fit: 'cover',
    offset: { x: 0, y: 0 },
    scale: 1,
    rotation: 0,
    background: '#ffffff',
    backgroundImage: null,
    backgroundOffset: { x: 0, y: 0 },
    backgroundScale: 1,
    backgroundRotation: 0,
    frames: [],
  },
};

const NO_SLEEP = { sleep: (): Promise<void> => Promise.resolve() };

class FakeGateway {
  invoke: () => Promise<GatewayResponse> = () =>
    Promise.resolve({ status: 200, body: {} });
  jobs: (GenerationJob | null)[] = [];
  assets: AssetRecord[] = [];
  lastBody: unknown = null;
  invokeCalls = 0;
  fetchCalls = 0;
  assetCalls = 0;

  invokeGenerate(body: unknown): Promise<GatewayResponse> {
    this.invokeCalls++;
    this.lastBody = body;
    return this.invoke();
  }

  fetchJob(): Promise<GenerationJob | null> {
    this.fetchCalls++;
    return Promise.resolve(this.jobs.shift() ?? null);
  }

  fetchAssets(): Promise<AssetRecord[]> {
    this.assetCalls++;
    return Promise.resolve(this.assets);
  }

  signRender(path: string): Promise<string | null> {
    return Promise.resolve(`signed:${path}`);
  }

  toConfiguredHost(url: string | null): string | null {
    return url;
  }
}

function setup(fake: FakeGateway): GenerationService {
  TestBed.configureTestingModule({
    providers: [{ provide: GenerationGateway, useValue: fake }],
  });
  return TestBed.inject(GenerationService);
}

describe('GenerationService', () => {
  it('modo síncrono: usa assets[].signed_url do 200 sem polling', async () => {
    const fake = new FakeGateway();
    fake.invoke = () =>
      Promise.resolve({
        status: 200,
        body: {
          job_id: 'J',
          status: 'done',
          assets: [{ kind: 'print_png', signed_url: 'png-url' }],
        },
      });
    const svc = setup(fake);

    const result = await svc.generate(REQUEST, NO_SLEEP);

    expect(result.printPngUrl).toBe('png-url');
    expect(fake.fetchCalls).toBe(0);
  });

  it('envia um job_id (uuid) no corpo e não usa header de idempotência', async () => {
    const fake = new FakeGateway();
    fake.invoke = () => Promise.resolve({ status: 200, body: { assets: [] } });
    const svc = setup(fake);

    await svc.generate(REQUEST, NO_SLEEP);

    const body = fake.lastBody as { job_id?: string };
    expect(typeof body.job_id).toBe('string');
    expect(body.job_id?.length).toBeGreaterThan(10);
  });

  it('fallback de polling (202): busca assets por job_id e assina do renders', async () => {
    const fake = new FakeGateway();
    fake.invoke = () => Promise.resolve({ status: 202, body: { status: 'processing' } });
    fake.jobs = [
      { id: 'J', status: 'processing' },
      { id: 'J', status: 'done' },
    ];
    fake.assets = [{ kind: 'print_png', storagePath: 'renders/J/print.png' }];
    const svc = setup(fake);

    const result = await svc.generate(REQUEST, NO_SLEEP);

    expect(result.printPngUrl).toBe('signed:renders/J/print.png');
    expect(fake.fetchCalls).toBe(2);
    expect(fake.assetCalls).toBe(1);
  });

  it('fallback de polling quando a chamada síncrona expira (8s)', async () => {
    const fake = new FakeGateway();
    fake.invoke = () => Promise.reject(new GenerationTimeoutError());
    fake.jobs = [{ id: 'J', status: 'done' }];
    fake.assets = [{ kind: 'print_png', storagePath: 'renders/J/print.png' }];
    const svc = setup(fake);

    const result = await svc.generate(REQUEST, NO_SLEEP);

    expect(result.printPngUrl).toBe('signed:renders/J/print.png');
  });

  it('propaga job status=error como falha terminal (sem retry)', async () => {
    const fake = new FakeGateway();
    fake.invoke = () => Promise.resolve({ status: 202, body: {} });
    fake.jobs = [{ id: 'J', status: 'error', errorMessage: 'render quebrou' }];
    const svc = setup(fake);

    await expect(svc.generate(REQUEST, NO_SLEEP)).rejects.toThrow('render quebrou');
    expect(fake.invokeCalls).toBe(1);
  });

  it('usa o job_id externo (options.jobId) quando fornecido — idempotência do lote', async () => {
    const fake = new FakeGateway();
    fake.invoke = () => Promise.resolve({ status: 200, body: { assets: [] } });
    const svc = setup(fake);

    await svc.generate(REQUEST, { ...NO_SLEEP, jobId: 'batch-job-123' });

    const body = fake.lastBody as { job_id?: string };
    expect(body.job_id).toBe('batch-job-123');
  });

  it('retenta a chamada até 3× em erro transitório', async () => {
    const fake = new FakeGateway();
    let calls = 0;
    fake.invoke = () => {
      calls++;
      if (calls < 3) {
        return Promise.reject(new Error('network'));
      }
      return Promise.resolve({
        status: 200,
        body: { assets: [{ kind: 'print_png', signed_url: 'ok.png' }] },
      });
    };
    const svc = setup(fake);

    const result = await svc.generate(REQUEST, NO_SLEEP);

    expect(result.printPngUrl).toBe('ok.png');
    expect(fake.invokeCalls).toBe(3);
  });

  it('retenta HTTP 546 (CPU da Edge) com backoff exponencial e conclui', async () => {
    const fake = new FakeGateway();
    let calls = 0;
    fake.invoke = () => {
      calls++;
      if (calls < 3) {
        return Promise.resolve({ status: 546, body: {} });
      }
      return Promise.resolve({
        status: 200,
        body: { assets: [{ kind: 'print_png', signed_url: 'ok.png' }] },
      });
    };
    const waits: number[] = [];
    const svc = setup(fake);

    const result = await svc.generate(REQUEST, {
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(result.printPngUrl).toBe('ok.png');
    expect(fake.invokeCalls).toBe(3);
    // Backoff entre as tentativas: 800ms, depois 1600ms (dobra a cada retry).
    expect(waits).toEqual([800, 1600]);
  });
});

describe('GenerationService.freshPrintUrl', () => {
  it('re-assina o print_png a partir do jobId', async () => {
    const fake = new FakeGateway();
    fake.assets = [{ kind: 'print_png', storagePath: 'u/j1/print.png' }];
    const svc = setup(fake);
    expect(await svc.freshPrintUrl('j1')).toBe('signed:u/j1/print.png');
  });

  it('retorna null sem jobId (sem tocar no gateway)', async () => {
    const fake = new FakeGateway();
    const svc = setup(fake);
    expect(await svc.freshPrintUrl(null)).toBeNull();
    expect(fake.assetCalls).toBe(0);
  });

  it('retorna null quando não há asset print_png', async () => {
    const fake = new FakeGateway();
    const svc = setup(fake);
    expect(await svc.freshPrintUrl('j1')).toBeNull();
  });

  it('retorna null quando o gateway falha', async () => {
    const fake = new FakeGateway();
    fake.fetchAssets = () => Promise.reject(new Error('boom'));
    const svc = setup(fake);
    expect(await svc.freshPrintUrl('j1')).toBeNull();
  });
});
