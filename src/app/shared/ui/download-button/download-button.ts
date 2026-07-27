import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * DownloadButton — âncora de download com alvo ≥44px.
 *
 * Recebe uma URL assinada (ou object URL de blob). Enquanto `url` é nulo,
 * exibe estado desabilitado com texto explicativo (não navega). Ícone é
 * decorativo (`aria-hidden`); o rótulo textual carrega o significado.
 *
 * A URL da arte é cross-origin (Storage do Supabase em outra porta), então o
 * atributo `download` sozinho é ignorado pelo navegador e o clique NAVEGA a aba
 * atual (perdendo o lote gerado). Correção: (1) `target="_blank"` abre em nova
 * aba, preservando a página; (2) `&download=<nome>` faz o Storage responder com
 * `Content-Disposition: attachment`, forçando o SALVAR em vez de abrir.
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

  /** URL com o parâmetro de download do Storage anexado (força "salvar"). */
  readonly href = computed<string | null>(() => {
    const url = this.url();
    if (!url) {
      return null;
    }
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}download=${encodeURIComponent(this.filename())}`;
  });

  get ready(): boolean {
    return this.url() !== null;
  }
}
