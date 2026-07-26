import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/ui';
import {
  ContextualTemplateService,
  type SceneTemplate,
} from '../contextual-mockup/contextual-template.service';
import { TemplateGrid } from '../contextual-mockup/template-grid/template-grid';
import { MockupEditor, type MockupDraft } from './mockup-editor/mockup-editor';

type ManagerMode = 'list' | 'editor';

/**
 * MockupManagerPage — área de curadoria de mockups (templates de cenário). Lista
 * a biblioteca, permite criar (subir uma foto e pré-definir o alvo SEM precisar
 * de um botton) e editar/excluir os existentes. Orquestra TemplateGrid (lista) e
 * MockupEditor (criar/editar), delegando persistência ao ContextualTemplateService.
 */
@Component({
  selector: 'app-mockup-manager-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TemplateGrid, MockupEditor],
  templateUrl: './mockup-manager.page.html',
  styleUrl: './mockup-manager.page.scss',
})
export class MockupManagerPage {
  private readonly templates = inject(ContextualTemplateService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly mode = signal<ManagerMode>('list');
  readonly editing = signal<SceneTemplate | null>(null);
  readonly saving = signal(false);

  newMockup(): void {
    this.editing.set(null);
    this.mode.set('editor');
  }

  onEdit(template: SceneTemplate): void {
    if (!template.thumbUrl) {
      this.toast.error('Prévia do mockup indisponível para edição.');
      return;
    }
    this.editing.set(template);
    this.mode.set('editor');
  }

  onCancel(): void {
    this.mode.set('list');
    this.editing.set(null);
  }

  async onSave(draft: MockupDraft): Promise<void> {
    this.saving.set(true);
    try {
      await this.persist(draft);
      this.toast.success(this.editing() ? 'Mockup atualizado.' : 'Mockup salvo na biblioteca.');
      this.onCancel();
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async backToMockup(): Promise<void> {
    await this.router.navigate(['/app/mockup']);
  }

  private async persist(draft: MockupDraft): Promise<void> {
    const current = this.editing();
    if (current) {
      await this.templates.update(current.id, { target: draft.target, scene: draft.scene });
      return;
    }
    if (!draft.scene) {
      throw new Error('Envie uma foto de cenário antes de salvar.');
    }
    await this.templates.save({ name: draft.name, scene: draft.scene, target: draft.target });
  }
}
