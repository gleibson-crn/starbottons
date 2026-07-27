import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ResolutionTier } from '../../../shared/types';
import { BOTTON_SIZES, type BatchItem, type BottonSize } from '../../../core/batch';
import { TIER_ICON, TIER_LABEL } from '../tier-visuals';

/**
 * SizeMultiSelect — fieldset de tamanhos (32/44/58) com semáforo por tamanho.
 *
 * Acessibilidade: `<fieldset>`+`<legend>` agrupam; cada checkbox tem `<label>`
 * associado (id único por item). Só o teto do lote deixa um tamanho `disabled`;
 * o 🔴 (resolução muito baixa) NÃO trava — fica marcável com um aviso forte via
 * `aria-describedby`. O tier é ícone+texto (o dot de cor nunca é a única pista).
 */
@Component({
  selector: 'app-size-multi-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './size-multi-select.html',
  styleUrl: './size-multi-select.scss',
})
export class SizeMultiSelect {
  readonly item = input.required<BatchItem>();
  readonly capped = input<boolean>(false);
  readonly sizeToggle = output<BottonSize>();

  readonly sizes = BOTTON_SIZES;

  checkboxId(size: BottonSize): string {
    return `size-${this.item().id}-${size}`;
  }

  reasonId(size: BottonSize): string {
    return `reason-${this.item().id}-${size}`;
  }

  isChecked(size: BottonSize): boolean {
    return this.item().selectedSizes.has(size);
  }

  tier(size: BottonSize): ResolutionTier {
    return this.item().perSizeTier[size];
  }

  icon(size: BottonSize): string {
    return TIER_ICON[this.tier(size)];
  }

  tierLabel(size: BottonSize): string {
    return TIER_LABEL[this.tier(size)];
  }

  isDisabled(size: BottonSize): boolean {
    return this.capped() && !this.isChecked(size);
  }

  /** `true` no tier 🔴: marcável, mas com aviso forte de risco de nitidez. */
  isRisk(size: BottonSize): boolean {
    return this.tier(size) === 'blocked';
  }

  reason(size: BottonSize): string {
    if (this.capped() && !this.isChecked(size)) {
      return 'Limite de artes do lote atingido.';
    }
    if (this.isRisk(size)) {
      return 'Resolução muito baixa — pode sair borrado. Gere por sua conta e risco.';
    }
    return '';
  }

  onToggle(size: BottonSize): void {
    this.sizeToggle.emit(size);
  }
}
