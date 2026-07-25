import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { DownloadButton } from '../../shared/ui';
import { loadImage } from '../../shared/utils';
import { mockupToBlob, renderMockup } from '../editor/mockup-render';

/**
 * ResultPage — passo 4. Dois downloads (PNG/PDF de impressão) vêm da Edge via
 * `signed_url`; o mockup PNG é gerado LOCALMENTE (canvas.toBlob) — a Edge não
 * o produz. "Ajustar novamente" preserva o enquadramento; "Novo botton" zera.
 */
@Component({
  selector: 'app-result-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DownloadButton],
  templateUrl: './result.page.html',
  styleUrl: './result.page.scss',
})
export class ResultPage {
  private readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);

  readonly mockupUrl = signal<string | null>(null);
  readonly artPngUrl = computed(() => this.store.result()?.printPngUrl ?? null);
  readonly artPdfUrl = computed(() => this.store.result()?.printPdfUrl ?? null);

  constructor() {
    if (!this.store.result()) {
      void this.router.navigate(['/app/upload']);
      return;
    }
    void this.buildMockup();
  }

  async adjustAgain(): Promise<void> {
    await this.router.navigate(['/app/editor']);
  }

  async newBotton(): Promise<void> {
    this.store.reset();
    await this.router.navigate(['/app/upload']);
  }

  private async buildMockup(): Promise<void> {
    const upload = this.store.upload();
    const spec = this.store.spec();
    if (!upload || !spec) {
      return;
    }
    const image = await loadImage(upload.previewUrl);
    const canvas = renderMockup({
      image,
      transform: this.store.transform(),
      spec,
      side: this.store.editorSide(),
    });
    const blob = await mockupToBlob(canvas);
    this.mockupUrl.set(URL.createObjectURL(blob));
  }
}
