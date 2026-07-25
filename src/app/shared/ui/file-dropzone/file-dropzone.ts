import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { sniffImageMime } from '../../utils';

const MB = 1024 * 1024;

/** Arquivo recusado na validação em lote: nome + motivo legível. */
export interface RejectedFile {
  readonly name: string;
  readonly reason: string;
}

/**
 * FileDropzone — área de soltar + botão "Procurar" com validação client-side.
 *
 * Acessibilidade: o input de arquivo nativo carrega o label; a zona inteira é
 * clicável mas o teclado opera pelo botão/label (sem `div onClick`). O estado
 * de arraste é apenas visual; erros são emitidos para anúncio via toast/aria.
 * Em modo múltiplo o `<input>` ganha o atributo `multiple` (o leitor de tela
 * anuncia "vários arquivos") e cada recusa é reportada por nome via
 * `filesRejected`, permitindo mensagem individual acessível por item.
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
  /** Quando `true`, aceita e valida vários arquivos por vez. */
  readonly multiple = input<boolean>(false);

  readonly fileAccepted = output<File>();
  readonly fileRejected = output<string>();
  /** Modo múltiplo: todos os arquivos válidos de uma seleção/arraste. */
  readonly filesAccepted = output<File[]>();
  /** Modo múltiplo: itens recusados, cada um com nome e motivo. */
  readonly filesRejected = output<RejectedFile[]>();

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
    void this.ingest(event.dataTransfer?.files ?? null);
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.ingest(input.files);
    input.value = '';
  }

  /** Roteia para o fluxo single (default) ou o de lote conforme `multiple`. */
  private ingest(list: FileList | null): Promise<void> {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) {
      return Promise.resolve();
    }
    return this.multiple() ? this.handleMany(files) : this.handle(files[0]);
  }

  private async handle(file: File): Promise<void> {
    const error = await this.validate(file);
    if (error) {
      this.fileRejected.emit(error);
      return;
    }
    this.fileAccepted.emit(file);
  }

  private async handleMany(files: File[]): Promise<void> {
    const accepted: File[] = [];
    const rejected: RejectedFile[] = [];
    for (const file of files) {
      const error = await this.validate(file);
      if (error) {
        rejected.push({ name: file.name, reason: error });
      } else {
        accepted.push(file);
      }
    }
    if (accepted.length > 0) {
      this.filesAccepted.emit(accepted);
    }
    if (rejected.length > 0) {
      this.filesRejected.emit(rejected);
    }
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
