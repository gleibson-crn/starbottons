import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * DownloadButton — âncora de download com alvo ≥44px.
 *
 * Recebe uma URL assinada (ou object URL de blob). Enquanto `url` é nulo,
 * exibe estado desabilitado com texto explicativo (não navega). Ícone é
 * decorativo (`aria-hidden`); o rótulo textual carrega o significado.
 */
@Component({
  selector: 'app-download-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './download-button.html',
  styleUrl: './download-button.scss',
})
export class DownloadButton {
  readonly label = input.required<string>();
  readonly description = input<string>('');
  readonly icon = input<string>('⬇');
  readonly url = input<string | null>(null);
  readonly filename = input<string>('star-botton');

  get ready(): boolean {
    return this.url() !== null;
  }
}
