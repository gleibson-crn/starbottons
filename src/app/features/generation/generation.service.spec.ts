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
  options: { fit: 'cover', offset: { x: 0, y: 0 }, scale: 1, rotation: 0, background: '#ffffff' },
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
          assets: [
            { kind: 'print_png', signed_url: 'png-url' },
            { kind: 'print_pdf', signed_url: 'pdf-url' },
          ],
        },
      });
    const svc = setup(fake);

    const result = await svc.generate(REQUEST, NO_SLEEP);

    expect(result.printPngUrl).toBe('png-url');
    expect(result.printPdfUrl).toBe('pdf-url');
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
    fake.assets = [
      { kind: 'print_png', storagePath: 'renders/J/print.png' },
      { kind: 'print_pdf', storagePath: 'renders/J/print.pdf' },
    ];
    const svc = setup(fake);

    const result = await svc.generate(REQUEST, NO_SLEEP);

    expect(result.printPngUrl).toBe('signed:renders/J/print.png');
    expect(result.printPdfUrl).toBe('signed:renders/J/print.pdf');
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
    expect(result.printPdfUrl).toBeNull();
  });

  it('propaga job status=error como falha terminal (sem retry)', async () => {
    const fake = new FakeGateway();
    fake.invoke = () => Promise.resolve({ status: 202, body: {} });
    fake.jobs = [{ id: 'J', status: 'error', errorMessage: 'render quebrou' }];
    const svc = setup(fake);

    await expect(svc.generate(REQUEST, NO_SLEEP)).rejects.toThrow('render quebrou');
    expect(fake.invokeCalls).toBe(1);
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
});
