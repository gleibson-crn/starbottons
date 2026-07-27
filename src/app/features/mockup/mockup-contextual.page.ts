import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { WorkflowStore } from '../../core/workflow';
import { DEFAULT_TRANSFORM, type EditorTransform } from '../../shared/types';
import {
  DownloadButton,
  mockupToBlob,
  renderMockupSprite,
  ToastService,
  type MockupSprite,
} from '../../shared/ui';
import { loadImage } from '../../shared/utils';
import { composeContextual } from './contextual-compose';
import { ContextualTemplateService, type SceneTemplate } from './contextual-template.service';
import { DEFAULT_SCENE_TARGET, type SceneTarget } from './scene-target';
import { SaveTemplateDialog } from './save-template-dialog/save-template-dialog';
import { SceneControls } from './scene-controls/scene-controls';
import { ScenePreview } from './scene-preview/scene-preview';
import { SourcePicker } from './source-picker/source-picker';

/** Raio-alvo (px) usado p/ dimensionar o sprite de PREVIEW (crispness). */
const PREVIEW_RADIUS = 640;

/**
 * MockupContextualPage — aplica a arte do botton (sprite renderizado do
 * WorkflowStore) sobre uma foto de cenário. Fases: empty (escolher cena),
 * composing (posicionar + exportar), saving (diálogo de template). O guard
 * garante upload + spec em memória.
 */
@Component({
  selector: 'app-mockup-contextual-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SourcePicker, ScenePreview, SceneControls, SaveTemplateDialog, DownloadButton],
  templateUrl: './mockup-contextual.page.html',
  styleUrl: './mockup-contextual.page.scss',
})
export class MockupContextualPage {
  private readonly store = inject(WorkflowStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly templates = inject(ContextualTemplateService);

  private bottonImage: HTMLImageElement | null = null;
  private sceneUrl: string | null = null;

  readonly sprite = signal<MockupSprite | null>(null);
  readonly scene = signal<HTMLImageElement | null>(null);
  readonly transform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  readonly target = signal<SceneTarget>(DEFAULT_SCENE_TARGET);
  /** Alvo normalizado inicial ao restaurar um template (null em upload). */
  readonly seed = signal<SceneTarget | null>(null);
  readonly resultUrl = signal<string | null>(null);
  readonly exporting = signal(false);
  readonly saving = signal(false);
  readonly showSave = signal(false);

  readonly hasScene = computed(() => this.scene() !== null);

  constructor() {
    void this.hydrateBotton();
  }

  onSceneFile(file: File): void {
    void this.loadScene(URL.createObjectURL(file));
  }

  onTemplateUse(template: SceneTemplate): void {
    if (!template.thumbUrl) {
      this.toast.error('Prévia do template indisponível.');
      return;
    }
    void this.loadTemplate(template);
  }

  onTarget(t: SceneTarget): void {
    this.target.set(t);
  }

  async exportPng(): Promise<void> {
    const canvas = this.compose();
    if (!canvas) {
      return;
    }
    this.exporting.set(true);
    try {
      const blob = await mockupToBlob(canvas);
      this.replaceResult(URL.createObjectURL(blob));
      this.toast.success('Mockup em cenário pronto para download.');
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.exporting.set(false);
    }
  }

  changeScene(): void {
    this.replaceResult(null);
    this.revokeScene();
    this.scene.set(null);
  }

  openSave(): void {
    if (this.hasScene()) {
      this.showSave.set(true);
    }
  }

  closeSave(): void {
    this.showSave.set(false);
  }

  async saveTemplate(name: string): Promise<void> {
    const scene = this.scene();
    if (!scene) {
      return;
    }
    this.saving.set(true);
    try {
      await this.templates.save({ name, scene, target: this.target() });
      this.toast.success('Template salvo na biblioteca.');
      this.showSave.set(false);
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async back(): Promise<void> {
    await this.router.navigate(['/app/upload']);
  }

  private compose(): HTMLCanvasElement | null {
    const scene = this.scene();
    const spec = this.store.spec();
    if (!scene || !this.bottonImage || !spec) {
      return null;
    }
    return composeContextual({
      scene,
      bottonImage: this.bottonImage,
      bottonTransform: this.store.transform(),
      spec,
      target: this.target(),
    });
  }

  private async hydrateBotton(): Promise<void> {
    const upload = this.store.upload();
    const spec = this.store.spec();
    if (!upload || !spec) {
      return;
    }
    this.bottonImage = await loadImage(upload.previewUrl);
    this.sprite.set(
      renderMockupSprite({
        image: this.bottonImage,
        transform: this.store.transform(),
        spec,
        targetRadiusPx: PREVIEW_RADIUS,
      }),
    );
  }

  private async loadScene(url: string): Promise<void> {
    this.replaceResult(null);
    this.revokeScene();
    this.sceneUrl = url;
    this.seed.set(null);
    this.transform.set(DEFAULT_TRANSFORM);
    this.scene.set(await loadImage(url));
  }

  private async loadTemplate(template: SceneTemplate): Promise<void> {
    this.replaceResult(null);
    const img = await loadImage(template.thumbUrl as string);
    this.target.set(template.target);
    this.seed.set(template.target);
    this.scene.set(img);
  }

  private replaceResult(url: string | null): void {
    const prev = this.resultUrl();
    if (prev) {
      URL.revokeObjectURL(prev);
    }
    this.resultUrl.set(url);
  }

  private revokeScene(): void {
    if (this.sceneUrl) {
      URL.revokeObjectURL(this.sceneUrl);
      this.sceneUrl = null;
    }
  }
}
