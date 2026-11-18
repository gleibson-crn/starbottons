import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FileDropzone, ModalService, ToastService } from '../../shared/ui';
import { FrameTemplateService, type FrameTemplate } from '../../core/frames';
import { FrameComposer } from './frame-composer/frame-composer';

type GridPhase = 'loading' | 'ready' | 'error';

/** MIME aceito na dropzone de molduras: só PNG (transparência revela a arte). */
const PNG_ONLY: readonly string[] = ['image/png'];

/**
 * FramesManagerPage — área de curadoria dos templates de MOLDURA do botton.
 * Espelha a curadoria de fundos, MAS aceita apenas PNG com transparência (a
 * moldura é a camada decorativa por cima da arte). (a) Formulário Nome +
 * dropzone (PNG) que registra a moldura via FrameTemplateService.save; (b) grade
 * das molduras com thumbnail, nome e exclusão (confirmação nativa); (c) clicar
 * na moldura abre o MONTADOR DE CAMADAS (FrameComposer: compõe a moldura com
 * 1..8 imagens, cada uma com enquadramento próprio, gerando o PNG achatado).
 * Feedback por toasts.
 *
 * Acessibilidade: `<label>` associado ao input de nome; a dropzone opera por
 * teclado (input nativo) e recusa não-PNG; o thumb é um `<button>` com
 * `aria-label` "Editar moldura"; o botão "Excluir" tem `aria-label`; estados de lista (loading/vazio/erro) em
 * `role="status"`.
 */
@Component({
  selector: 'app-frames-manager-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileDropzone, FrameComposer],
  templateUrl: './frames-manager.page.html',
  styleUrl: './frames-manager.page.scss',
})
export class FramesManagerPage implements OnInit, OnDestroy {
  private readonly service = inject(FrameTemplateService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(ModalService);

  /** MIME aceito pela dropzone (só PNG). */
  readonly accept = PNG_ONLY;

  readonly name = signal('');
  readonly pendingFile = signal<File | null>(null);
  readonly pendingPreview = signal<string | null>(null);
  readonly saving = signal(false);

  readonly templates = signal<FrameTemplate[]>([]);
  readonly phase = signal<GridPhase>('loading');
  /** Moldura em edição de enquadramento padrão (ou `null`). */
  readonly editing = signal<FrameTemplate | null>(null);

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
      this.toast.success('Moldura salva na biblioteca.');
      this.resetForm();
    } catch (err) {
      this.toast.error((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async removeTemplate(template: FrameTemplate): Promise<void> {
    if (!(await this.confirmDelete(template.name))) {
      return;
    }
    try {
      await this.service.remove(template);
      this.templates.update((list) => list.filter((t) => t.id !== template.id));
      this.toast.success('Moldura excluída.');
    } catch (err) {
      this.toast.error((err as Error).message);
    }
  }

  /** Abre o montador de camadas da moldura. */
  edit(template: FrameTemplate): void {
    this.editing.set(template);
  }

  /** Fecha o montador de camadas. */
  closeEditor(): void {
    this.editing.set(null);
  }

  /** Composição salva: atualiza o card (thumb achatado novo) e mantém o editor aberto. */
  onComposed(updated: FrameTemplate): void {
    this.templates.update((list) =>
      list.map((t) => (t.id === updated.id ? updated : t)),
    );
    this.editing.set(updated);
    this.toast.success('Composição salva.');
  }

  async reload(): Promise<void> {
    this.phase.set('loading');
    await this.load();
  }

  private confirmDelete(name: string): Promise<boolean> {
    return this.modal.showConfirm({
      title: 'Excluir moldura?',
      message: `Excluir a moldura "${name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
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
