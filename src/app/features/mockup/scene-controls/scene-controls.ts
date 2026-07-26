import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import type { EditorTransform } from '../../../shared/ui';
import {
  ROT_MAX,
  ROT_MIN,
  resetTransform,
  SCALE_MAX,
  SCALE_MIN,
  withRotation,
  withScale,
  withZoom,
} from '../../../shared/ui';

/**
 * SceneControls — equivalentes de teclado/gesto (WCAG 2.1.1) para o alvo do
 * mockup contextual: sliders de Tamanho e Rotação, botões +/− e Redefinir.
 * Espelha o EditorControls, mas IGNORA o campo de fundo (não se aplica à cena).
 * Cada controle tem `<label>` associado; sliders expõem min/max/step nativos.
 */
@Component({
  selector: 'app-scene-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './scene-controls.html',
  styleUrl: './scene-controls.scss',
})
export class SceneControls {
  readonly transform = model.required<EditorTransform>();

  readonly scaleMin = SCALE_MIN;
  readonly scaleMax = SCALE_MAX;
  readonly rotMin = ROT_MIN;
  readonly rotMax = ROT_MAX;

  larger(): void {
    this.transform.update((t) => withZoom(t, 1.1));
  }

  smaller(): void {
    this.transform.update((t) => withZoom(t, 1 / 1.1));
  }

  onSize(value: string): void {
    this.transform.update((t) => withScale(t, Number(value)));
  }

  onRotation(value: string): void {
    this.transform.update((t) => withRotation(t, Number(value)));
  }

  reset(): void {
    this.transform.update((t) => resetTransform(t));
  }
}
