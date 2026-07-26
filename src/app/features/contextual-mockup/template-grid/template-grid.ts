import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { ToastService } from '../../../shared/ui';
import {
  ContextualTemplateService,
  type SceneTemplate,
} from '../contextual-template.service';
import { TemplateCard } from './template-card';

type GridPhase = 'loading' | 'ready' | 'error';

/**
 * TemplateGrid — biblioteca de cenas salvas. Carrega via
 * ContextualTemplateService (estados loading/empty/error acessíveis via
 * `role="status"`), emite `use` ao selecionar e exclui internamente (com toast).
 */
@Component({
  selector: 'app-template-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TemplateCard],
  templateUrl: './template-grid.html',
  styleUrl: './template-grid.scss',
})
export class TemplateGrid implements OnInit {
  private readonly service = inject(ContextualTemplateService);
  private readonly toast = inject(ToastService);

  /** Rótulo da ação primária de cada card (default "Usar"). */
  readonly actionLabel = input('Usar');
  /** Quando `true`, pede confirmação nativa antes de excluir (curadoria). */
  readonly confirmRemove = input(false);
  readonly use = output<SceneTemplate>();

  readonly templates = signal<SceneTemplate[]>([]);
  readonly phase = signal<GridPhase>('loading');

  ngOnInit(): void {
    void this.load();
  }

  onUse(template: SceneTemplate): void {
    this.use.emit(template);
  }

  async onRemove(template: SceneTemplate): Promise<void> {
    if (this.confirmRemove() && !this.confirmDelete(template.name)) {
      return;
    }
    try {
      await this.service.remove(template);
      this.templates.update((list) => list.filter((t) => t.id !== template.id));
      this.toast.success('Template excluído.');
    } catch (err) {
      this.toast.error((err as Error).message);
    }
  }

  async reload(): Promise<void> {
    this.phase.set('loading');
    await this.load();
  }

  /** Confirmação nativa (bloqueante e acessível) antes de excluir. */
  private confirmDelete(name: string): boolean {
    return globalThis.confirm(`Excluir o mockup "${name}"? Esta ação não pode ser desfeita.`);
  }

  private async load(): Promise<void> {
    try {
      this.templates.set(await this.service.list());
      this.phase.set('ready');
    } catch {
      this.phase.set('error');
    }
  }
}
