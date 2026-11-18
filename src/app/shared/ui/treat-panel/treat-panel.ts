import {
  ChangeDetectionStrategy,
  Component,
  computed,
  model,
} from '@angular/core';
import type { ImageFilters, StyleEffect } from '../../types';
import { DEFAULT_FILTERS, DEFAULT_STYLE_EFFECT, isDefaultFilters } from '../../types';
import { FilterSlider } from '../filter-slider/filter-slider';
import { activePresetId, FILTER_PRESETS, type PresetId } from './filter-presets';

/**
 * TreatPanel — aba "Tratar" do editor. Reúne os chips de preset TONAL (seleção
 * única, `aria-pressed`: Original/P&B/Sépia/Vívido) e três sliders de fator
 * (brilho/contraste/saturação). Mover um controle fora da assinatura de um
 * preset deixa os chips inativos ("Personalizado"). O `model` `style` existe só
 * por compatibilidade de binding e permanece SEMPRE em `DEFAULT_STYLE_EFFECT`.
 * Não altera o enquadramento nem chama a Edge.
 */
@Component({
  selector: 'app-treat-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterSlider],
  templateUrl: './treat-panel.html',
  styleUrl: './treat-panel.scss',
})
export class TreatPanel {
  readonly filters = model.required<ImageFilters>();
  readonly style = model<StyleEffect>(DEFAULT_STYLE_EFFECT);

  readonly presets = FILTER_PRESETS;
  readonly activeId = computed(() => activePresetId(this.filters()));
  readonly isCustom = computed(() => this.activeId() === null);
  readonly isNeutral = computed(() => isDefaultFilters(this.filters()));

  isActive(id: PresetId): boolean {
    return this.activeId() === id;
  }

  /** Aplica um preset tonal; o estilo permanece neutro. */
  selectPreset(id: PresetId): void {
    const preset = FILTER_PRESETS.find((p) => p.id === id);
    if (preset) {
      this.filters.set(preset.filters);
      this.style.set(DEFAULT_STYLE_EFFECT);
    }
  }

  onBrightness(value: number): void {
    this.filters.update((f) => ({ ...f, brightness: value }));
  }

  onContrast(value: number): void {
    this.filters.update((f) => ({ ...f, contrast: value }));
  }

  onSaturate(value: number): void {
    this.filters.update((f) => ({ ...f, saturate: value }));
  }

  reset(): void {
    this.filters.set(DEFAULT_FILTERS);
    this.style.set(DEFAULT_STYLE_EFFECT);
  }
}
