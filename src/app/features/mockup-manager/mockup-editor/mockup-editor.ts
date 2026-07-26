import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DEFAULT_TRANSFORM, type EditorTransform } from '../../../shared/types';
import { FileDropzone, ToastService } from '../../../shared/ui';
import { loadImage } from '../../../shared/utils';
import type { SceneTemplate } from '../../contextual-mockup/contextual-template.service';
import { SaveTemplateDialog } from '../../contextual-mockup/save-template-dialog/save-template-dialog';
import { SceneControls } from '../../contextual-mockup/scene-controls/scene-controls';
import { ScenePreview } from '../../contextual-mockup/scene-preview/scene-preview';
import {
  DEFAULT_SCENE_TARGET,
  type SceneTarget,
} from '../../contextual-mockup/scene-target';

/** Payload de salvamento emitido pelo editor de curadoria. */
export interface MockupDraft {
  /** Nome do mockup (obrigatório ao criar; mantido ao editar). */
  readonly name: string;
  readonly target: SceneTarget;
  /** Cena a persistir/re-encodar; null ao editar sem trocar a foto. */
  readonly scene: HTMLImageElement | null;
}

/**
 * MockupEditor — posiciona o alvo circular sobre uma cena SEM botton (curadoria).
 * Reusa ScenePreview (sprite=null → mostra o disco placeholder), SceneControls e
 * o SaveTemplateDialog. Serve para criar (sobe a foto pela FileDropzone) e editar
 * (recebe `template`, carrega a cena assinada e re-semeia o alvo salvo).
 *
 * Acessibilidade: herda o teclado do ScenePreview (setas movem, +/− dimensionam)
 * e dos sliders do SceneControls; toda ação tem rótulo textual e o diálogo de
 * salvar trapeia foco. Estados: escolher cena → posicionar → salvar.
 */
@Component({
  selector: 'app-mockup-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileDropzone, ScenePreview, SceneControls, SaveTemplateDialog],
  templateUrl: './mockup-editor.html',
  styleUrl: './mockup-editor.scss',
})
export class MockupEditor {
  private readonly toast = inject(ToastService);

  /** Template em edição; null = criar do zero. */
  readonly template = input<SceneTemplate | null>(null);
  readonly busy = input(false);
  readonly saved = output<MockupDraft>();
  readonly canceled = output<void>();

  readonly accept = ['image/png', 'image/jpeg'];

  readonly scene = signal<HTMLImageElement | null>(null);
  readonly seed = signal<SceneTarget | null>(null);
  readonly transform = signal<EditorTransform>(DEFAULT_TRANSFORM);
  readonly target = signal<SceneTarget>(DEFAULT_SCENE_TARGET);
  readonly showSave = signal(false);
  readonly swapping = signal(false);

  /** Cena nova a subir: sempre no criar; no editar só se o usuário trocar a foto. */
  private replacement: HTMLImageElement | null = null;
  private objectUrl: string | null = null;

  readonly isEdit = computed(() => this.template() !== null);
  readonly hasScene = computed(() => this.scene() !== null);
  readonly showDropzone = computed(
    () => this.swapping() || (!this.isEdit() && !this.hasScene()),
  );

  constructor() {
    effect(() => {
      const t = this.template();
      if (t) {
        void this.loadTemplateScene(t);
      }
    });
  }

  onSceneFile(file: File): void {
    this.revoke();
    this.objectUrl = URL.createObjectURL(file);
    this.swapping.set(false);
    void this.applyScene(this.objectUrl);
  }

  onRejected(message: string): void {
    this.toast.error(message);
  }

  onTarget(t: SceneTarget): void {
    this.target.set(t);
  }

  startSwap(): void {
    this.swapping.set(true);
  }

  cancelSwap(): void {
    this.swapping.set(false);
  }

  onSaveClick(): void {
    if (!this.hasScene()) {
      return;
    }
    if (this.isEdit()) {
      this.emit(this.template()?.name ?? '');
      return;
    }
    this.showSave.set(true);
  }

  onDialogSaved(name: string): void {
    this.showSave.set(false);
    this.emit(name);
  }

  closeSave(): void {
    this.showSave.set(false);
  }

  onCancel(): void {
    this.revoke();
    this.canceled.emit();
  }

  private emit(name: string): void {
    if (!this.scene()) {
      return;
    }
    this.saved.emit({ name, target: this.target(), scene: this.replacement });
  }

  private async applyScene(url: string): Promise<void> {
    const img = await loadImage(url);
    this.replacement = img;
    this.seed.set(this.isEdit() ? this.target() : null);
    this.scene.set(img);
  }

  private async loadTemplateScene(template: SceneTemplate): Promise<void> {
    if (!template.thumbUrl) {
      this.toast.error('Prévia do mockup indisponível.');
      return;
    }
    const img = await loadImage(template.thumbUrl);
    this.replacement = null;
    this.target.set(template.target);
    this.seed.set(template.target);
    this.scene.set(img);
  }

  private revoke(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
