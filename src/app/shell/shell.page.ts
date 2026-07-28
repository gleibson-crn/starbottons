import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth';

/**
 * ShellPage — moldura das telas internas: cabeçalho com o menu global de
 * navegação (Novo botton / Curadoria de mockups) + logout, e um rótulo
 * contextual (lote / cenário / curadoria) conforme a rota ativa.
 *
 * O rótulo vem de `route.data` (batch/contextual/manage) da rota ativa,
 * atualizado a cada navegação. O menu superior destaca a rota ativa via
 * `routerLinkActive`/`aria-current`.
 */
@Component({
  selector: 'app-shell-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.page.html',
  styleUrl: './shell.page.scss',
})
export class ShellPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  /** `true` quando a rota ativa é o fluxo de lote (grid). */
  readonly batchMode = signal(false);
  /** `true` na rota do mockup contextual. */
  readonly contextualMode = signal(false);
  /** `true` na área curadora de mockups. */
  readonly manageMode = signal(false);
  /** `true` na área curadora de fundos. */
  readonly manageBackgroundsMode = signal(false);
  /** `true` na Área de Impressão. */
  readonly printMode = signal(false);

  constructor() {
    this.syncContext();
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.syncContext());
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/auth']);
  }

  private syncContext(): void {
    let child = this.route.firstChild;
    while (child?.firstChild) {
      child = child.firstChild;
    }
    const data = child?.snapshot?.data;
    this.batchMode.set(data?.['batch'] === true);
    this.contextualMode.set(data?.['contextual'] === true);
    this.manageMode.set(data?.['manage'] === true);
    this.manageBackgroundsMode.set(data?.['manageBackgrounds'] === true);
    this.printMode.set(data?.['print'] === true);
  }
}
