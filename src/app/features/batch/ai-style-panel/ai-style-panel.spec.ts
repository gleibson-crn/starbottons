/**
 * AiStylePanel — Trilha 2 (ADR-021): fluxo "Estilo com IA" extraído do
 * BatchEditorDialog (BL-001). Com um provedor configurado (fake, SEM rede),
 * `applyAiStyle` envia a foto ao provedor, materializa o retorno via
 * TreatedUploadService.createTreatedUpload e passa a marcar `aiStyled`;
 * `generationUpload` guarda o upload estilizado (lido pelo diálogo no onSave) e
 * `resultChange` propaga a imagem/filtros/estilo ao PAI. Image/canvas/URL são
 * stubados (jsdom não carrega recursos nem rasteriza).
 */
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DEFAULT_FILTERS, type UploadRecord } from '../../../shared/types';
import { UploadService, TreatedUploadService } from '../../../core/upload';
import {
  AiCreditStatus,
  StyleProviderRegistry,
  StyleTransferError,
} from '../../../core/style-provider';
import type {
  AiCreditState,
  StyleProvider,
  StyleTransferRequest,
  StyleTransferResult,
} from '../../../core/style-provider';
import { AiStylePanel, type AiStyleResult } from './ai-style-panel';

const STYLED_UPLOAD: UploadRecord = {
  id: 'styled-1',
  path: 't',
  fileName: 'arte-tratado.png',
  width: 800,
  height: 600,
  previewUrl: 'blob:styled',
};

/** Provedor fake: registra o pedido e devolve um Blob "estilizado" + custo. */
const provider: StyleProvider & { lastReq: StyleTransferRequest | null } = {
  id: 'gemini-edge',
  displayName: 'Estilo com IA (Gemini)',
  requiresNetwork: true,
  lastReq: null,
  isConfigured: () => true,
  listStyles: async () => [
    { id: 'cartoon', label: 'Cartoon' },
    { id: 'anime', label: 'Anime' },
  ],
  apply: async (req: StyleTransferRequest): Promise<StyleTransferResult> => {
    provider.lastReq = req;
    return {
      image: new Blob(['STYLED'], { type: 'image/png' }),
      provider: 'gemini',
      costEstimateUsd: 0.02,
    };
  },
};

const fakeRegistry: Pick<
  StyleProviderRegistry,
  'uiAvailable' | 'enabled' | 'list' | 'get' | 'register'
> = {
  uiAvailable: () => true,
  enabled: () => true,
  list: () => [provider],
  get: () => provider,
  register: () => undefined,
};

const createTreatedUpload = vi.fn().mockResolvedValue(STYLED_UPLOAD);
const fakeTreated: Pick<TreatedUploadService, 'createTreatedUpload'> = {
  createTreatedUpload,
};

const fakeUploads: Pick<UploadService, 'probe' | 'upload'> = {
  probe: async () => ({ width: 100, height: 100, previewUrl: 'blob:x' }),
  upload: async () => STYLED_UPLOAD,
};

/** Image que resolve `onload` de imediato (jsdom não dispara sozinho). */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  crossOrigin = '';
  naturalWidth = 800;
  naturalHeight = 600;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** Canvas fake com toBlob (jsdom não implementa rasterização). */
function fakeCanvas(): HTMLCanvasElement {
  const ctx = { drawImage: () => undefined, clearRect: () => undefined, filter: '' };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    toBlob: (cb: (b: Blob | null) => void) =>
      cb(new Blob(['orig'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;
}

/**
 * Duble do AiCreditStatus: CAPTURA a probe (sem executá-la no init) e expõe um
 * `status` gravável para verificar que `aiNoCredits`/`aiCreditsChecking`
 * espelham o serviço. É uma FUNÇÃO (não classe) para não violar
 * max-classes-per-file na spec.
 */
function fakeAiCredit() {
  const status = signal<AiCreditState>('unknown');
  const state = {
    status,
    captured: null as (() => Promise<void>) | null,
    ensureChecked: vi.fn(async (probe: () => Promise<void>): Promise<void> => {
      state.captured = probe;
    }),
    markNoCredits: vi.fn((): void => status.set('no_credits')),
  };
  return state;
}
type FakeCredit = ReturnType<typeof fakeAiCredit>;

/** Deixa microtasks + timers 0ms assentarem (probe de créditos ao abrir). */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function makeFixture(): ComponentFixture<AiStylePanel> {
  const fixture = TestBed.createComponent(AiStylePanel);
  fixture.componentRef.setInput('fileName', 'a.png');
  fixture.componentRef.setInput('sourceImage', new FakeImage() as unknown as HTMLImageElement);
  fixture.detectChanges();
  return fixture;
}

/**
 * Cria o painel e espera a probe de créditos (disparada no ngOnInit) assentar.
 * Depois limpa o pedido da PROBE em `provider.lastReq` para que os testes de
 * `applyAiStyle` observem apenas o pedido da aplicação real.
 */
async function bootPanel(): Promise<ComponentFixture<AiStylePanel>> {
  TestBed.configureTestingModule({
    providers: [
      { provide: UploadService, useValue: fakeUploads },
      { provide: TreatedUploadService, useValue: fakeTreated },
      { provide: StyleProviderRegistry, useValue: fakeRegistry },
    ],
  });
  const fixture = makeFixture();
  await flush();
  provider.lastReq = null;
  createTreatedUpload.mockClear();
  return fixture;
}

/** Como `bootPanel`, mas injeta um AiCreditStatus controlável (duble). */
async function bootPanelWith(
  credit: FakeCredit,
): Promise<ComponentFixture<AiStylePanel>> {
  TestBed.configureTestingModule({
    providers: [
      { provide: UploadService, useValue: fakeUploads },
      { provide: TreatedUploadService, useValue: fakeTreated },
      { provide: StyleProviderRegistry, useValue: fakeRegistry },
      { provide: AiCreditStatus, useValue: credit },
    ],
  });
  const fixture = makeFixture();
  await flush();
  provider.lastReq = null;
  createTreatedUpload.mockClear();
  return fixture;
}

/**
 * Stub de canvas SÓ para `elementToPngBlob` (chamado dentro de `applyAiStyle`).
 * O template do painel não tem <canvas>, então pode ser instalado a qualquer
 * momento após o boot, imediatamente antes de aplicar o estilo.
 */
function stubCanvasFactory(): void {
  const orig = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? fakeCanvas() : orig(tag),
  );
}

describe('AiStylePanel — Estilo com IA (gated ON)', () => {
  beforeEach(() => {
    provider.lastReq = null;
    createTreatedUpload.mockClear();
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:styled');
  });

  afterEach(() => vi.restoreAllMocks());

  it('a seção fica disponível quando o registry libera a UI', async () => {
    const cmp = (await bootPanel()).componentInstance;
    expect(cmp.aiStyleAvailable).toBe(true);
  });

  it('applyAiStyle envia ao provedor, materializa o tratado e marca aiStyled', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('cartoon');
    stubCanvasFactory();

    await cmp.applyAiStyle();

    // Pedido ao provedor com estilo + intensidade default + signal.
    expect(provider.lastReq?.styleId).toBe('cartoon');
    expect(provider.lastReq?.strength).toBe(0.6);
    expect(provider.lastReq?.image).toBeInstanceOf(Blob);
    expect(provider.lastReq?.signal).toBeInstanceOf(AbortSignal);

    // Retorno materializado como upload tratado (filtros neutros, teto na service).
    expect(createTreatedUpload).toHaveBeenCalledTimes(1);
    expect(createTreatedUpload.mock.calls[0][1]).toEqual(DEFAULT_FILTERS);
    expect(createTreatedUpload.mock.calls[0][2]).toBe('a.png');

    expect(cmp.aiStyled()).toBe(true);
    expect(cmp.aiPhase()).toBe('done');
    expect(cmp.aiCostUsd()).toBe(0.02);
  });

  it('após aplicar, generationUpload guarda o upload estilizado + aiStyled', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('anime');
    stubCanvasFactory();
    await cmp.applyAiStyle();

    expect(cmp.aiStyled()).toBe(true);
    expect(cmp.generationUpload()).toBe(STYLED_UPLOAD);
  });

  it('resultChange emite a imagem estilizada (filtros/estilo neutros) ao aplicar', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('cartoon');
    stubCanvasFactory();

    let result: AiStyleResult | undefined;
    cmp.resultChange.subscribe((r) => (result = r));
    await cmp.applyAiStyle();

    expect(result?.styled).toBe(true);
    expect(result?.upload).toBe(STYLED_UPLOAD);
    expect(result?.filters).toEqual(DEFAULT_FILTERS);
    expect(result?.image).toBeTruthy();
  });

  it('erro insufficient_credits inativa os filtros (aiNoCredits) sem erro genérico', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('cartoon');
    stubCanvasFactory();
    vi.spyOn(provider, 'apply').mockRejectedValueOnce(
      new StyleTransferError(
        'É necessário inserir créditos na conta de IA para usar os filtros com IA.',
        'insufficient_credits',
      ),
    );

    await cmp.applyAiStyle();

    expect(cmp.aiNoCredits()).toBe(true);
    // Não é tratado como erro genérico: sem aiError e volta a idle.
    expect(cmp.aiError()).toBeNull();
    expect(cmp.aiPhase()).toBe('idle');
  });

  it('erro genérico (sem code) exibe aiError e não inativa os filtros', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('cartoon');
    stubCanvasFactory();
    vi.spyOn(provider, 'apply').mockRejectedValueOnce(
      new StyleTransferError('Falha genérica no serviço.'),
    );

    await cmp.applyAiStyle();

    expect(cmp.aiNoCredits()).toBe(false);
    expect(cmp.aiError()).toBe('Falha genérica no serviço.');
    expect(cmp.aiPhase()).toBe('error');
  });

  it('sem estilo selecionado, applyAiStyle é no-op', async () => {
    const cmp = (await bootPanel()).componentInstance;
    await cmp.applyAiStyle();
    // `provider.lastReq` foi zerado no boot (pedido da PROBE descartado).
    expect(provider.lastReq).toBeNull();
    expect(cmp.aiStyled()).toBe(false);
  });

  it('voltar a um estilo já gerado usa o CACHE — sem nova chamada nem crédito', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('cartoon');
    stubCanvasFactory();
    await cmp.applyAiStyle();
    expect(cmp.aiStyled()).toBe(true);

    // A partir daqui, NENHUMA nova geração deve ocorrer.
    const applySpy = vi.spyOn(provider, 'apply');
    createTreatedUpload.mockClear();

    // Seleciona um estilo AINDA não gerado → prévia volta ao original.
    cmp.selectAiStyle('anime');
    expect(cmp.aiStyled()).toBe(false);
    expect(cmp.aiPhase()).toBe('idle');

    // Volta ao cartoon já gerado → restaura do cache (done), sem provider/upload.
    cmp.selectAiStyle('cartoon');
    expect(cmp.aiPhase()).toBe('done');
    expect(cmp.aiStyled()).toBe(true);
    expect(applySpy).not.toHaveBeenCalled();
    expect(createTreatedUpload).not.toHaveBeenCalled();
  });

  it('reaplicar o MESMO estilo já gerado reusa o cache (não chama o provedor)', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('cartoon');
    stubCanvasFactory();
    await cmp.applyAiStyle();

    const applySpy = vi.spyOn(provider, 'apply');
    // Sem trocar de estilo: pedir "Aplicar" de novo NÃO deve regerar.
    await cmp.applyAiStyle();
    expect(applySpy).not.toHaveBeenCalled();
    expect(cmp.aiPhase()).toBe('done');
  });

  it('clicar no estilo ATIVO desativa a IA e volta à imagem original', async () => {
    const cmp = (await bootPanel()).componentInstance;
    cmp.selectAiStyle('cartoon');
    stubCanvasFactory();
    await cmp.applyAiStyle();
    expect(cmp.aiStyled()).toBe(true);

    cmp.selectAiStyle('cartoon'); // toggle OFF
    expect(cmp.aiStyleId()).toBeNull();
    expect(cmp.aiStyled()).toBe(false);
    expect(cmp.aiPhase()).toBe('idle');
  });
});

describe('AiStylePanel — probe de créditos ao abrir', () => {
  beforeEach(() => {
    provider.lastReq = null;
    createTreatedUpload.mockClear();
    vi.stubGlobal('Image', FakeImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:styled');
  });

  afterEach(() => vi.restoreAllMocks());

  it('ngOnInit dispara ensureChecked uma vez e a UI espelha o serviço', async () => {
    const credit = fakeAiCredit();
    const cmp = (await bootPanelWith(credit)).componentInstance;

    expect(credit.ensureChecked).toHaveBeenCalledTimes(1);
    expect(cmp.aiNoCredits()).toBe(false);
    expect(cmp.aiCreditsChecking()).toBe(false);

    credit.status.set('checking');
    expect(cmp.aiCreditsChecking()).toBe(true);

    credit.status.set('no_credits');
    expect(cmp.aiNoCredits()).toBe(true);
  });

  it('a probe resolve (status ok) quando o provedor aceita a micro-geração', async () => {
    const credit = fakeAiCredit();
    await bootPanelWith(credit);
    stubCanvasFactory();

    await expect(credit.captured?.()).resolves.toBeUndefined();
    // Payload da probe: estilo default + intensidade fixa 0.6 (sem a arte real).
    expect(provider.lastReq?.styleId).toBe('cartoon');
    expect(provider.lastReq?.strength).toBe(0.6);
  });

  it('a probe rejeita insufficient_credits quando o provedor recusa', async () => {
    const credit = fakeAiCredit();
    await bootPanelWith(credit);
    stubCanvasFactory();
    vi.spyOn(provider, 'apply').mockRejectedValueOnce(
      new StyleTransferError('sem crédito', 'insufficient_credits'),
    );

    await expect(credit.captured?.()).rejects.toMatchObject({
      code: 'insufficient_credits',
    });
  });
});
