import { onePixelPngBlob } from '../../shared/utils';
import type { StyleProvider } from './style-provider';

/** Intensidade irrelevante para a probe (imagem 1×1) — valor fixo qualquer. */
const PROBE_STRENGTH = 0.6;

/**
 * Probe de créditos da conta de IA (Trilha 2, ADR-021): envia um PNG 1×1
 * (payload MÍNIMO, NUNCA a arte do usuário) ao provedor. SEM crédito é grátis (o
 * erro de billing é pré-cobrança); COM crédito custa uma micro-geração — por
 * isso o `AiCreditStatus` cacheia o resultado por SESSÃO. Resolve quando há
 * crédito; rejeita `StyleTransferError insufficient_credits` quando não há.
 *
 * Vive no core (não na feature) para ser reutilizável tanto pelo boot do app
 * (provideStyleTransfer) quanto pelo diálogo de edição.
 */
export async function probeAiCredits(provider: StyleProvider): Promise<void> {
  const image = await onePixelPngBlob();
  await provider.apply({ image, styleId: 'cartoon', strength: PROBE_STRENGTH });
}
