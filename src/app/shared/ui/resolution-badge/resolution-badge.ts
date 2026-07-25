import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { resolutionTier } from '../../utils';
import type { ResolutionTier } from '../../types';

interface TierView {
  readonly icon: string;
  readonly title: string;
  readonly hint: string;
}

const TIER_VIEW: Record<ResolutionTier, TierView> = {
  ok: { icon: '🟢', title: 'Resolução ótima', hint: 'Pronta para impressão em alta qualidade.' },
  warn: { icon: '🟡', title: 'Resolução baixa', hint: 'Dá para gerar, mas pode perder nitidez.' },
  blocked: { icon: '🔴', title: 'Resolução insuficiente', hint: 'Aproxime menos ou use uma imagem maior.' },
};

/**
 * ResolutionBadge — semáforo de DPI efetivo ao vivo.
 * Usa ícone + texto (não só cor) e é anunciado por `aria-live=polite`.
 */
@Component({
  selector: 'app-resolution-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './resolution-badge.html',
  styleUrl: './resolution-badge.scss',
})
export class ResolutionBadge {
  readonly dpi = input.required<number>();
  /** Modo compacto: oculta a linha de meta (DPI + dica), mantendo o título. */
  readonly dense = input<boolean>(false);
  readonly tier = computed<ResolutionTier>(() => resolutionTier(this.dpi()));
  readonly view = computed<TierView>(() => TIER_VIEW[this.tier()]);
  readonly roundedDpi = computed(() => Math.round(this.dpi()));
}
