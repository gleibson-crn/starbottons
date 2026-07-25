import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import type { EditorTransform } from '../../shared/types';
import {
  ROT_MAX,
  ROT_MIN,
  SCALE_MAX,
  SCALE_MIN,
  resetTransform,
  withBackground,
  withRotation,
  withScale,
  withZoom,
} from '../../shared/ui';

/**
 * EditorControls — controles equivalentes aos gestos (WCAG 2.1.1): sliders de
 * zoom e rotação, botões +/−, seletor de cor de fundo e redefinir. Cada
 * controle tem `<label>` associado; sliders expõem min/max/step nativos.
 */
@Component({
  selector: 'app-editor-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './editor-controls.html',
  styleUrl: './editor-controls.scss',
})
export class EditorControls {
  readonly transform = model.required<EditorTransform>();

  readonly scaleMin = SCALE_MIN;
  readonly scaleMax = SCALE_MAX;
  readonly rotMin = ROT_MIN;
  readonly rotMax = ROT_MAX;

  zoomIn(): void {
    this.transform.update((t) => withZoom(t, 1.1));
  }

  zoomOut(): void {
    this.transform.update((t) => withZoom(t, 1 / 1.1));
  }

  onScale(value: string): void {
    this.transform.update((t) => withScale(t, Number(value)));
  }

  onRotation(value: string): void {
    this.transform.update((t) => withRotation(t, Number(value)));
  }

  onBackground(value: string): void {
    this.transform.update((t) => withBackground(t, value));
  }

  reset(): void {
    this.transform.update((t) => resetTransform(t));
  }
}
