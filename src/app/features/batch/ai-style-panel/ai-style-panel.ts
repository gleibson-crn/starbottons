import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import type { ImageFilters, StyleEffect, UploadRecord } from '../../../shared/types';
import { DEFAULT_FILTERS, DEFAULT_STYLE_EFFECT } from '../../../shared/types';
import { imageElementToPngBlob, loadImage } from '../../../shared/utils';
import { TreatedUploadService } from '../../../core/upload';
import {
  AiCreditStatus,
  probeAiCredits,
  StyleProviderRegistry,
  StyleTransferError,
  type StyleOption,
  type StyleProvider,
  type StyleTransferResult,
} from '../../../core/style-provider';

/** Intensidade FIXA de todas as gerações por IA (0..1) → "moderate" na Edge. */
export const AI_DEFAULT_STRENGTH = 0.6;

/**
 * Teto do lado maior (px) da imagem ENVIADA à IA. Os modelos de imagem
 * (gpt-image) devolvem no máximo ~1536px, então enviar a foto full-res (12–24MP)
 * só infla payload/upload/tempo — SEM ganho de qualidade — e chegava a estourar
 * o orçamento de tempo da Edge (timeout "demorou demais"). Reduzir a ~1536 na
 * entrada torna a chamada rápida (~25s) e confiável.
 */
export const AI_INPUT_MAX_SIDE = 1536;

/** Fase do fluxo de estilização por IA (Trilha 2, ADR-021). */
type AiPhase = 'idle' | 'loading' | 'done' | 'error';

/**
 * Resultado emitido ao PAI sempre que o estado de IA muda. O PAI (diálogo do
 * lote) mantém a prévia e aplica `image`/`filters`/`style` na sua própria
 * `<app-canvas-editor>`; `upload`/`styled`/`costUsd` alimentam o `onSave`.
 */
export interface AiStyleResult {
  /** Imagem a exibir (estilizada ao aplicar; a original ao reverter). */
  readonly image: HTMLImageElement | null;
  readonly filters: ImageFilters;
  readonly style: StyleEffect;
  /** Upload tratado full-res ESTILIZADO (ou `null` ao reverter). */
  readonly upload: UploadRecord | null;
  readonly costUsd: number | null;
  /** `true` quando o resultado é de IA (aplicado); `false` ao reverter. */
  readonly styled: boolean;
}

/** Entrada do CACHE por sessão: estilo já gerado, reusável sem regerar. */
interface AiCacheEntry {
  readonly image: HTMLImageElement;
  readonly upload: UploadRecord;
  readonly costUsd: number | null;
}

/**
 * AiStylePanel — Trilha 2 (ADR-021): a seção "Estilo com IA" extraída do
 * BatchEditorDialog (débito BL-001). Style transfer por provedor EXTERNO pago:
 * envia a foto ORIGINAL à Edge, materializa o retorno como upload TRATADO e
 * emite o resultado ao PAI (que mantém a prévia). Gated por `aiStyleAvailable`
 * (`registry.enabled() && algumProvider.isConfigured()`), DESLIGADO por default
 * → esta seção NÃO renderiza (nenhum egress, LOCAL-ONLY intacto). Acessibilidade:
 * chips com `aria-pressed`, aviso persistente de egress (`role="note"`), barra
 * de progresso indeterminada (`role="progressbar"`) e status ao vivo
 * (`role="status"`/`alert`) navegáveis por teclado.
 */
@Component({
  selector: 'app-ai-style-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-style-panel.html',
  styleUrl: './ai-style-panel.scss',
})
export class AiStylePanel implements OnInit {
  private readonly treated = inject(TreatedUploadService);
  private readonly styleProviders = inject(StyleProviderRegistry);
  private readonly aiCreditStatus = inject(AiCreditStatus);

  /**
   * Imagem ORIGINAL (crua) do item — fonte de TODO estilo de IA (nunca a já
   * estilizada, senão empilharia estilos). O PAI a captura no hydrate.
   */
  readonly sourceImage = input<HTMLImageElement | null>(null);
  /** Nome do arquivo do item, para nomear o upload tratado estilizado. */
  readonly fileName = input.required<string>();
  /** Filtros locais ANTES de qualquer IA — restaurados ao reverter à original. */
  readonly originalFilters = input<ImageFilters>(DEFAULT_FILTERS);
  readonly originalStyle = input<StyleEffect>(DEFAULT_STYLE_EFFECT);

  /** Emite ao aplicar (styled) e ao reverter (não styled). */
  readonly resultChange = output<AiStyleResult>();

  /**
   * Trilha 2 (ADR-021): a seção só aparece quando a integração está habilitada E
   * há provedor configurado. DESLIGADO por default → sempre `false` hoje.
   */
  readonly aiStyleAvailable = this.styleProviders.uiAvailable();
  /** Primeiro provedor configurado (ou `null` — a UI não renderiza sem ele). */
  private readonly aiProvider: StyleProvider | null =
    this.styleProviders.list().find((p) => p.isConfigured()) ?? null;

  /** Estilos oferecidos pelo provedor (carregados no boot da UI de IA). */
  readonly aiStyles = signal<readonly StyleOption[]>([]);
  /** Estilo de IA selecionado (seleção única) ou `null`. */
  readonly aiStyleId = signal<string | null>(null);
  readonly aiPhase = signal<AiPhase>('idle');
  readonly aiError = signal<string | null>(null);
  /**
   * `true` quando a conta de IA está SEM CRÉDITOS (Edge respondeu HTTP 402 com
   * `code: 'insufficient_credits'`). Reflete o `AiCreditStatus` (cacheado por
   * sessão): os filtros de IA continuam VISÍVEIS, mas ficam INATIVOS.
   */
  readonly aiNoCredits = computed(
    () => this.aiCreditStatus.status() === 'no_credits',
  );
  /** `true` enquanto a probe de créditos (ao abrir) ainda não respondeu. */
  readonly aiCreditsChecking = computed(
    () => this.aiCreditStatus.status() === 'checking',
  );
  /** Estimativa de custo (USD) da última aplicação, se a Edge informar. */
  readonly aiCostUsd = signal<number | null>(null);
  /** `true` quando a imagem atual já foi estilizada por IA. */
  readonly aiStyled = signal(false);
  /** Upload tratado full-res estilizado (lido pelo PAI no `onSave`). */
  readonly generationUpload = signal<UploadRecord | null>(null);
  private aiController: AbortController | null = null;

  /** CACHE por estilo já gerado nesta sessão: reusar ao voltar a um estilo NÃO
   * regera nem consome créditos. Chave = styleId (fonte/força são fixas aqui). */
  private readonly aiCache = new Map<string, AiCacheEntry>();

  ngOnInit(): void {
    const provider = this.aiProvider;
    if (this.aiStyleAvailable && provider) {
      void provider.listStyles().then((s) => this.aiStyles.set(s));
      // Descobre o crédito JÁ ao abrir (uma vez por sessão, cacheado no
      // AiCreditStatus) para não surpreender só na hora de aplicar.
      void this.aiCreditStatus.ensureChecked(() => probeAiCredits(provider));
    }
  }

  /**
   * Seleciona um estilo de IA (seleção única). Se JÁ foi gerado nesta sessão,
   * RESTAURA do cache na hora (sem regerar/gastar crédito). Clicar no estilo
   * ativo de novo desativa a IA e volta à imagem ORIGINAL. Estilo ainda não
   * gerado → fica só selecionado (o botão "Aplicar" habilita).
   */
  selectAiStyle(id: string): void {
    if (this.aiStyleId() === id) {
      this.aiStyleId.set(null);
      this.restoreOriginal();
      return;
    }
    this.aiStyleId.set(id);
    const cached = this.aiCache.get(id);
    if (cached) {
      this.restoreAi(cached);
    } else {
      // Estilo ainda não gerado → prévia volta ao original até clicar "Aplicar".
      this.restoreOriginal();
    }
  }

  /** Volta à imagem original (remove o estilo de IA), sem regerar. */
  private restoreOriginal(): void {
    this.generationUpload.set(null);
    this.aiStyled.set(false);
    this.aiCostUsd.set(null);
    this.aiError.set(null);
    this.aiPhase.set('idle');
    // Recupera o tratamento local que a IA havia zerado.
    this.resultChange.emit({
      image: this.sourceImage(),
      filters: this.originalFilters(),
      style: this.originalStyle(),
      upload: null,
      costUsd: null,
      styled: false,
    });
  }

  /** Adota um resultado de IA (do cache ou recém-gerado) como fonte da prévia. */
  private restoreAi(entry: AiCacheEntry): void {
    this.generationUpload.set(entry.upload);
    this.aiStyled.set(true);
    this.aiCostUsd.set(entry.costUsd);
    this.aiError.set(null);
    this.aiPhase.set('done');
    this.resultChange.emit({
      image: entry.image,
      filters: DEFAULT_FILTERS,
      style: DEFAULT_STYLE_EFFECT,
      upload: entry.upload,
      costUsd: entry.costUsd,
      styled: true,
    });
  }

  /**
   * Trilha 2 (ADR-021) — aplica o estilo por IA: envia a foto ORIGINAL full-res
   * ao provedor (Edge `style-transfer`), materializa o retorno como upload
   * TRATADO (teto 1280 aplicado lá) e passa a mostrá-lo na prévia. A imagem SAI
   * da máquina — por isso o aviso persistente na UI. Cancelável via AbortSignal.
   */
  async applyAiStyle(): Promise<void> {
    const provider = this.aiProvider;
    // SEMPRE parte da imagem ORIGINAL (não da já estilizada) → estilos não empilham.
    const src = this.sourceImage();
    const styleId = this.aiStyleId();
    if (!provider || !src || !styleId || this.aiPhase() === 'loading') {
      return;
    }
    // Já gerado nesta sessão → reusa (sem edge/crédito).
    const cached = this.aiCache.get(styleId);
    if (cached) {
      this.restoreAi(cached);
      return;
    }
    this.aiError.set(null);
    this.aiCostUsd.set(null);
    this.aiPhase.set('loading');
    this.aiController = new AbortController();
    try {
      // Reduz a ~1536px antes de enviar: o modelo de IA não usa mais que isso;
      // full-res só inflava o payload e estourava o tempo (timeout).
      const original = await imageElementToPngBlob(src, AI_INPUT_MAX_SIDE);
      const result = await provider.apply({
        image: original,
        styleId,
        strength: AI_DEFAULT_STRENGTH,
        signal: this.aiController.signal,
      });
      await this.absorbAiResult(styleId, result);
    } catch (err) {
      this.onAiError(err);
    }
  }

  /** Cancela a estilização em voo (aborta a chamada externa). */
  cancelAiStyle(): void {
    this.aiController?.abort();
    this.aiPhase.set('idle');
  }

  /**
   * Materializa o Blob estilizado como upload tratado full-res e o adota como
   * fonte da prévia, zerando filtros/estilo locais (a IA substitui o
   * tratamento). O upload viaja no `onSave` como `generationUpload`.
   */
  private async absorbAiResult(
    styleId: string,
    result: StyleTransferResult,
  ): Promise<void> {
    const styled = await loadImage(URL.createObjectURL(result.image));
    const upload = await this.treated.createTreatedUpload(
      styled,
      DEFAULT_FILTERS,
      this.fileName(),
    );
    const costUsd = result.costEstimateUsd ?? null;
    // Guarda no cache da sessão: voltar a este estilo reusa (sem regerar/crédito).
    this.aiCache.set(styleId, { image: styled, upload, costUsd });
    this.restoreAi({ image: styled, upload, costUsd });
  }

  /**
   * Cancelamento é silencioso (volta a idle). Falta de crédito (`code
   * 'insufficient_credits'`) INATIVA os filtros de IA com aviso próprio, sem
   * tratar como erro genérico (sem `aiError`). Demais falhas exibem mensagem.
   */
  private onAiError(err: unknown): void {
    if (this.aiController?.signal.aborted) {
      this.aiPhase.set('idle');
      return;
    }
    if (err instanceof StyleTransferError && err.code === 'insufficient_credits') {
      // Aplicação real sem crédito → alinha o cache de sessão a 'no_credits'.
      this.aiCreditStatus.markNoCredits();
      this.aiPhase.set('idle');
      return;
    }
    this.aiError.set(
      err instanceof Error ? err.message : 'Falha ao aplicar o estilo com IA.',
    );
    this.aiPhase.set('error');
  }
}
