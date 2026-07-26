import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

/** Fator neutro/limites do slider (interno 0.5–1.5 ↔ exibido 50–150%). */
const MIN = 0.5;
const MAX = 1.5;
const STEP = 0.05;

/**
 * FilterSlider — slider de um fator de filtro (brilho/contraste/saturação).
 * Valor interno 0.5–1.5, exibido em porcentagem (100% = neutro). Expõe
 * `<label for>` associado e `aria-valuetext` legível (ex.: "Brilho 120%").
 */
@Component({
  selector: 'app-filter-slider',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './filter-slider.html',
  styleUrl: './filter-slider.scss',
})
export class FilterSlider {
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly valueChange = output<number>();

  readonly min = MIN;
  readonly max = MAX;
  readonly step = STEP;

  readonly percent = computed(() => Math.round(this.value() * 100));
  readonly valueText = computed(() => `${this.label()} ${this.percent()}%`);

  onInput(raw: string): void {
    this.valueChange.emit(Number(raw));
  }
}
