import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FileDropzone, ToastService } from '../../../shared/ui';
import type { SceneTemplate } from '../contextual-template.service';
import { TemplateGrid } from '../template-grid/template-grid';

type SourceTab = 'upload' | 'library';

/**
 * SourcePicker — escolha da cena por abas WAI-ARIA: "Enviar foto"
 * (FileDropzone, PNG/JPEG validados por magic-bytes) e "Biblioteca"
 * (TemplateGrid). Tablist navegável por setas; cada painel é `role="tabpanel"`
 * rotulado pela aba. Emite o arquivo aceito ou o template escolhido.
 */
@Component({
  selector: 'app-source-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FileDropzone, TemplateGrid],
  templateUrl: './source-picker.html',
  styleUrl: './source-picker.scss',
})
export class SourcePicker {
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly sceneFile = output<File>();
  readonly templateUse = output<SceneTemplate>();

  readonly tab = signal<SourceTab>('upload');
  readonly accept = ['image/png', 'image/jpeg'];

  select(tab: SourceTab): void {
    this.tab.set(tab);
  }

  onTablistKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const next = this.tab() === 'upload' ? 'library' : 'upload';
    this.tab.set(next);
    const list = (event.target as HTMLElement).parentElement;
    list?.querySelector<HTMLElement>(`#tab-${next}`)?.focus();
  }

  onAccepted(file: File): void {
    this.sceneFile.emit(file);
  }

  onRejected(message: string): void {
    this.toast.error(message);
  }

  onTemplate(template: SceneTemplate): void {
    this.templateUse.emit(template);
  }

  manage(): void {
    void this.router.navigate(['/app/mockups']);
  }
}
