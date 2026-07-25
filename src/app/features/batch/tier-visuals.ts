import type { ResolutionTier } from '../../shared/types';

/** Ícone por tier — mesmo vocabulário visual da ResolutionBadge. */
export const TIER_ICON: Record<ResolutionTier, string> = {
  ok: '🟢',
  warn: '🟡',
  blocked: '🔴',
};

/** Rótulo textual do tier (acompanha a cor — nunca só cor, WCAG 1.4.1). */
export const TIER_LABEL: Record<ResolutionTier, string> = {
  ok: 'resolução ótima',
  warn: 'resolução baixa',
  blocked: 'resolução insuficiente',
};
