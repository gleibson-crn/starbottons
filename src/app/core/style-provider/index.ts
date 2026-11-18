/**
 * Trilha 2 (ADR-020) — style transfer por IA, provider-agnostic e DESLIGADO por
 * default. Só o extension point; nenhum provedor pago cablado. Ver ADR-020.
 */
export type {
  StyleOption,
  StyleProvider,
  StyleTransferRequest,
  StyleTransferResult,
} from './style-provider';
export { StyleTransferError } from './style-provider';
export { StyleProviderRegistry } from './registry';
export { AiCreditStatus } from './ai-credit-status';
export type { AiCreditState } from './ai-credit-status';
export { NullStyleProvider } from './null-style-provider';
export { GeminiEdgeStyleProvider } from './gemini-edge-style-provider';
export { provideStyleTransfer } from './provide-style-transfer';
export { probeAiCredits } from './probe-ai-credits';
