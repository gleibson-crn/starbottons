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
  /**
   * Provedor opcional de URL FRESH (re-assina no clique, pois a signed URL
   * guardada pode ter expirado). Se resolver `null`/falhar, usa `url`.
   */
  readonly refresh = input<(() => Promise<string | null>) | null>(null);

  /** Com `refresh`, intercepta o clique, re-assina e dispara o download. */
  async onClick(event: Event): Promise<void> {
    const refresh = this.refresh();
    if (!refresh) {
      return;
    }
    event.preventDefault();
    const fresh = await refresh().catch(() => null);
    const href = this.buildHref(fresh ?? this.url());
    if (!href) {
      return;
    }
    // `?download=` faz o Storage responder com attachment: salva sem navegar.
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = this.filename();
    anchor.rel = 'noopener';
    anchor.click();
  }

  private buildHref(url: string | null): string | null {
    if (!url) {
      return null;
    }
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}download=${encodeURIComponent(this.filename())}`;
  }

  /**
   * URL de download. Para URLs http(s) (Storage do Supabase, cross-origin)
   * anexa `download=<nome>` para forçar `Content-Disposition: attachment`. Para
   * object/data URLs (`blob:`/`data:`, geradas localmente) devolve como está — o
   * atributo `download` já basta e anexar query CORROMPERIA a URL (o navegador
   * tentaria buscá-la e falharia com falso erro de rede).
   */
  readonly href = computed<string | null>(() => this.buildHref(this.url()));

  get ready(): boolean {
    return this.url() !== null;
  }
}
