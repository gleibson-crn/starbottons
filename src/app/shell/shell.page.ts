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
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth';
import { Stepper } from '../shared/ui';

/**
 * ShellPage — moldura das telas internas: cabeçalho com logout e o Stepper
 * persistente (Upload › Modelo & Tamanho › Ajuste › Resultado).
 *
 * O índice do passo vem de `route.data.step` da rota ativa, atualizado a cada
 * navegação — mantém o Stepper sincronizado sem cada página reimplementá-lo.
 */
@Component({
  selector: 'app-shell-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Stepper],
  templateUrl: './shell.page.html',
  styleUrl: './shell.page.scss',
})
export class ShellPage {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly step = signal(0);

  constructor() {
    this.syncStep();
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.syncStep());
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/auth']);
  }

  private syncStep(): void {
    let child = this.route.firstChild;
    while (child?.firstChild) {
      child = child.firstChild;
    }
    const step = child?.snapshot?.data?.['step'];
    this.step.set(typeof step === 'number' ? step : 0);
  }
}
