import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FileDropzone, ToastService } from '../../shared/ui';
import {
  BackgroundTemplateService,
  type BackgroundTemplate,
} from '../../core/backgrounds';

type GridPhase = 'loading' | 'ready' | 'error';

/**
 * BackgroundsManagerPage — área de curadoria dos templates de FUNDO do botton.
 * Sem editor de alvo/cena (diferente da curadoria de mockups): apenas (a) um
 * formulário Nome + dropzone (PNG/JPEG) que registra o fundo via
 * BackgroundTemplateService.save e (b) a grade dos fundos cadastrados com
 * thumbnail, nome e exclusão (confirmação nativa). Feedback por toasts.
 *
 * Acessibilidade: `<label>` associado ao input de nome; a dropzone opera por
 * teclado (input nativo); cada card tem `alt` descritivo e botão "Excluir" com
 * `aria-label`; estados de lista (loading/vazio/erro) em `role="status"`.
 */
@Component({
  selector: 'app-backgrounds-manager-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileDropzone],
  templateUrl: './backgrounds-manager.page.html',
  styleUrl: './backgrounds-manager.page.scss',
})
export class BackgroundsManagerPage implements OnInit, OnDestroy {
  private readonly service = inject(BackgroundTemplateService);
  private readonly toast = inject(ToastService);

  readonly name = signal('');
  readonly pendingFile = signal<File | null>(null);
  readonly pendingPreview = signal<string | null>(null);
  readonly saving = signal(false);

  readonly templates = signal<BackgroundTemplate[]>([]);
  readonly phase = signal<GridPhase>('loading');

  readonly canSave = computed(
    () => !this.saving() && this.name().trim().length > 0 && !!this.pendingFile(),
  );

  ngOnInit(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  onNameInput(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  /** Guarda o arquivo escolhido e cria uma prévia local (object URL). */
  onFile(file: File): void {
    this.revokePreview();
    this.pendingFile.set(file);
    this.pendingPreview.set(URL.createObjectURL(file));
  }

  onFileRejected(reason: string): void {
    this.toast.error(reason);
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    const file = this.pendingFile()!;
    this.saving.set(true);
    try {
      const tpl = await this.service.save({ name: this.name().trim(), file });
      this.templates.update((list) => [tpl, ...list]);
      this.toast.success('Fundo salvo na biblioteca.');
      this.resetForm();
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async removeTemplate(template: BackgroundTemplate): Promise<void> {
    if (!this.confirmDelete(template.name)) {
      return;
    }
    try {
      await this.service.remove(template);
      this.templates.update((list) => list.filter((t) => t.id !== template.id));
      this.toast.success('Fundo excluído.');
    } catch (err) {
      this.toast.error((err as Error).message);
    }
  }

  async reload(): Promise<void> {
    this.phase.set('loading');
    await this.load();
  }

  private confirmDelete(name: string): boolean {
    return globalThis.confirm(`Excluir o fundo "${name}"? Esta ação não pode ser desfeita.`);
  }

  private resetForm(): void {
    this.name.set('');
    this.pendingFile.set(null);
    this.revokePreview();
  }

  private revokePreview(): void {
    const url = this.pendingPreview();
    if (url) {
      URL.revokeObjectURL(url);
      this.pendingPreview.set(null);
    }
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
