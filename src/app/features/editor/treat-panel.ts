import {
  ChangeDetectionStrategy,
  Component,
  computed,
  model,
} from '@angular/core';
import type { ImageFilters } from '../../shared/types';
import { DEFAULT_FILTERS, isDefaultFilters } from '../../shared/types';
import { FilterSlider } from './filter-slider';
import {
  activePresetId,
  FILTER_PRESETS,
  type PresetId,
} from './filter-presets';

/**
 * TreatPanel — aba "Tratar" do editor. Reúne os chips de preset (seleção única,
 * `aria-pressed`) e três sliders de fator (brilho/contraste/saturação). Mover um
 * slider fora da assinatura de um preset deixa todos os chips inativos e mostra
 * a legenda "Personalizado". Não altera o enquadramento nem chama a Edge.
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

  readonly presets = FILTER_PRESETS;
  readonly activeId = computed(() => activePresetId(this.filters()));
  readonly isCustom = computed(() => this.activeId() === null);
  readonly isNeutral = computed(() => isDefaultFilters(this.filters()));

  isActive(id: PresetId): boolean {
    return this.activeId() === id;
  }

  selectPreset(id: PresetId): void {
    const preset = this.presets.find((p) => p.id === id);
    if (preset) {
      this.filters.set(preset.filters);
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
  }
}
