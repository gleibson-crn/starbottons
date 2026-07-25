import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { sniffImageMime } from '../../utils';

const MB = 1024 * 1024;

/**
 * FileDropzone — área de soltar + botão "Procurar" com validação client-side.
 *
 * Acessibilidade: o input de arquivo nativo carrega o label; a zona inteira é
 * clicável mas o teclado opera pelo botão/label (sem `div onClick`). O estado
 * de arraste é apenas visual; erros são emitidos para anúncio via toast/aria.
 */
@Component({
  selector: 'app-file-dropzone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './file-dropzone.html',
  styleUrl: './file-dropzone.scss',
})
export class FileDropzone {
  /** MIME types aceitos. */
  readonly accept = input<readonly string[]>(['image/png', 'image/jpeg']);
  /** Tamanho máximo em MB. */
  readonly maxMb = input<number>(25);

  readonly fileAccepted = output<File>();
  readonly fileRejected = output<string>();

  readonly dragging = signal(false);

  get acceptAttr(): string {
    return this.accept().join(',');
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.handle(file);
    }
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.handle(file);
    }
    input.value = '';
  }

  private async handle(file: File): Promise<void> {
    const error = await this.validate(file);
    if (error) {
      this.fileRejected.emit(error);
      return;
    }
    this.fileAccepted.emit(file);
  }

  private async validate(file: File): Promise<string | null> {
    if (!this.accept().includes(file.type)) {
      return 'Formato inválido. Envie PNG ou JPEG.';
    }
    if (file.size > this.maxMb() * MB) {
      return `Arquivo muito grande (máx. ${this.maxMb()} MB).`;
    }
    const signature = await this.sniff(file);
    if (!signature || !this.accept().includes(signature)) {
      return 'O conteúdo do arquivo não parece uma imagem PNG/JPEG válida.';
    }
    return null;
  }

  /** Lê os primeiros bytes e confere a assinatura real (anti-forja de MIME). */
  private async sniff(file: File): Promise<string | null> {
    const buffer = await file.slice(0, 12).arrayBuffer();
    return sniffImageMime(new Uint8Array(buffer));
  }
}
