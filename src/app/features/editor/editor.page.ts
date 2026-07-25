import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { ResolutionBadge } from '../../shared/ui';
import type { EditorTransform } from '../../shared/types';
import { canGenerateAtDpi, effectiveDpi, loadImage } from '../../shared/utils';
import { CanvasEditor } from './canvas-editor';
import { EditorControls } from './editor-controls';

/**
 * EditorPage — passo 3 (ajuste manual). Reúne o canvas, os controles, o badge
 * de resolução ao vivo e o gating de "Gerar". Preserva o enquadramento no
 * store para "Ajustar novamente" e para a Edge Function.
 */
@Component({
  selector: 'app-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasEditor, EditorControls, ResolutionBadge],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.scss',
})
export class EditorPage {
  private readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);

  readonly upload = this.store.upload;
  readonly spec = this.store.spec;
  readonly image = signal<HTMLImageElement | null>(null);
  readonly transform = signal<EditorTransform>(this.store.transform());
  readonly bleedCovered = signal(true);

  private readonly canvas = viewChild(CanvasEditor);
  readonly dpi = computed(() => this.computeDpi());
  readonly canGenerate = computed(() => canGenerateAtDpi(this.dpi()));

  constructor() {
    if (!this.store.hasUpload()) {
      void this.router.navigate(['/app/upload']);
      return;
    }
    if (!this.store.hasSelection()) {
      void this.router.navigate(['/app/selection']);
      return;
    }
    void this.hydrateImage();
  }

  onCoverage(covered: boolean): void {
    this.bleedCovered.set(covered);
  }

  async generate(): Promise<void> {
    if (!this.canGenerate()) {
      return;
    }
    this.store.setTransform(this.transform(), this.canvas()?.side());
    await this.router.navigate(['/app/processing']);
  }

  async back(): Promise<void> {
    this.store.setTransform(this.transform(), this.canvas()?.side());
    await this.router.navigate(['/app/selection']);
  }

  private computeDpi(): number {
    const img = this.image();
    const spec = this.spec();
    if (!img || !spec) {
      return 0;
    }
    return effectiveDpi({
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      scale: this.transform().scale,
      spec,
    });
  }

  private async hydrateImage(): Promise<void> {
    const url = this.store.upload()?.previewUrl;
    if (url) {
      this.image.set(await loadImage(url));
    }
  }
}
