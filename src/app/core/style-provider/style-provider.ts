/**
 * Trilha 2 (ADR-020) — contrato provider-agnostic de STYLE TRANSFER por IA.
 *
 * ATENÇÃO: qualquer implementação real desta interface fala com um provedor
 * EXTERNO pago e ENVIA a arte do usuário para fora da máquina — isto QUEBRA o
 * princípio LOCAL-ONLY do Star Bottons. Por isso nada aqui é cablado: só existe
 * o contrato + registry, DESLIGADO por default (ver `StyleProviderRegistry`).
 *
 * Os ids de estilo são GENÉRICOS (ex.: 'cartoon', 'aquarela', 'linha').
 * É PROIBIDO expor nomes de franquia (marca registrada / risco de IP).
 */

/** Um estilo oferecido por um provedor. `id` genérico — NUNCA nome de franquia. */
export interface StyleOption {
  readonly id: string;
  readonly label: string;
}

/** Pedido de estilização. A `image` SAI da máquina quando enviada ao provedor. */
export interface StyleTransferRequest {
  readonly image: Blob;
  readonly styleId: string;
  /** Intensidade do efeito, 0..1 (opcional). */
  readonly strength?: number;
  /** Permite cancelar a chamada externa. */
  readonly signal?: AbortSignal;
}

/** Resultado da estilização, com estimativa de custo para exibir/registrar. */
export interface StyleTransferResult {
  readonly image: Blob;
  readonly provider: string;
  /** Estimativa de custo em USD da chamada (~0,003–0,20/imagem). */
  readonly costEstimateUsd?: number;
}

/**
 * Adaptador para um provedor de style transfer. `requiresNetwork` é sempre
 * `true` e serve como marcador explícito de que usar este provedor quebra o
 * LOCAL-ONLY. Nenhuma implementação concreta é fornecida por default.
 */
export interface StyleProvider {
  readonly id: string;
  readonly displayName: string;
  /** Sempre true: este caminho depende de rede/serviço externo. */
  readonly requiresNetwork: true;
  /** Tem chave/endpoint configurados para operar? */
  isConfigured(): boolean;
  listStyles(): Promise<readonly StyleOption[]>;
  apply(req: StyleTransferRequest): Promise<StyleTransferResult>;
}

/**
 * Erro tipado de style transfer. Além da mensagem (segura, vinda da Edge),
 * carrega o `code` do corpo de erro (ex.: `'insufficient_credits'`) para que a
 * UI decida o tratamento — por exemplo, INATIVAR os filtros de IA e mostrar um
 * aviso de "sem créditos" em vez de um erro genérico com stack.
 */
export class StyleTransferError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'StyleTransferError';
  }
}
