import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  type OnInit,
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
import { BatchStore, summarize, type Snapshot } from '../core/batch';
import { APP_VERSION } from '../core/app-version';
import { UpdateService } from '../core/update.service';
import { ModalService, ToastService, type ModalChoice } from '../shared/ui';

type BatchDecision = 'print' | 'zip' | 'edit' | 'clear';
type ResumeDecision = 'restore' | 'discard';

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * ShellPage — moldura das telas internas: cabeçalho com o menu global de
 * navegação (Botton / Bottons (N) / Impressão / Curadorias) + logout, e um
 * rótulo contextual (lote / cenário / curadoria) conforme a rota ativa.
 *
 * O rótulo vem de `route.data` (batch/contextual/manage) da rota ativa,
 * atualizado a cada navegação. O menu superior destaca a rota ativa via
 * `routerLinkActive`/`aria-current`.
 *
 * Proteção do lote: "Botton" nunca apaga em silêncio — com lote em andamento
 * abre um diálogo para imprimir/baixar/editar antes de limpar; e o
 * `beforeunload` avisa ao fechar/recarregar a aba.
 */
@Component({
  selector: 'app-shell-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.page.html',
  styleUrl: './shell.page.scss',
})
export class ShellPage implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly modal = inject(ModalService);
  private readonly toast = inject(ToastService);
  protected readonly updates = inject(UpdateService);
  /** Versão exibida discretamente no cabeçalho. */
  protected readonly version = APP_VERSION;
  protected readonly batch = inject(BatchStore);

  /** `true` quando a rota ativa é o fluxo de lote (grid). */
  readonly batchMode = signal(false);
  /** `true` na rota do mockup contextual. */
  readonly contextualMode = signal(false);
  /** `true` na área curadora de mockups. */
  readonly manageMode = signal(false);
  /** `true` na área curadora de fundos. */
  readonly manageBackgroundsMode = signal(false);
  /** `true` na área curadora de molduras. */
  readonly manageFramesMode = signal(false);
  /** `true` na Área de Impressão. */
  readonly printMode = signal(false);
  /** `true` na tela de upload (link "Botton" é tratado à mão, sem routerLink). */
  readonly uploadActive = signal(false);

  constructor() {
    this.syncContext();
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.syncContext());
  }

  /** BL-008: ao entrar em /app, oferece retomar o último lote salvo (antes de qualquer reset). */
  async ngOnInit(): Promise<void> {
    // "Atualizado!" (A) ou "Nova versão disponível" (B), exclusivos; não bloqueia a UI
    void this.updates.checkOnBoot();
    try {
      const snapshot = await this.batch.loadResumable();
      if (snapshot) {
        await this.offerResume(snapshot);
      }
    } catch {
      // persistência é best-effort: nunca trava a abertura do app
    }
  }

  /** Aviso nativo do navegador ao fechar/recarregar com lote em andamento. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    this.batch.flushPersist();
    if (this.batch.hasWork()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  /** Sem lote vai direto ao upload; com lote OFERECE dar andamento antes de limpar. */
  async onBottonClick(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.batch.hasWork()) {
      await this.router.navigate(['/app/upload']);
      return;
    }
    await this.decide();
  }

  /**
   * "Sair" do app desktop: confirma e fecha a janela (o start-app.ps1 então
   * derruba servidor + Supabase do projeto). NÃO faz signOut: a sessão fica.
   * Se a janela não fechar (aba normal), avisa que já pode fechar.
   */
  async exit(): Promise<void> {
    // Fecha na hora, sem pop-up: salva o lote (retomável no próximo boot) e
    // sinaliza o atalho a fechar a janela — o Chrome bloqueia window.close() em
    // --app, então quem fecha é o start-app.ps1 (via flag scripts/.quit).
    this.batch.flushPersist();
    await this.requestQuit();
    this.closeWindow(); // fallback para navegador comum (ng serve puro)
  }

  /** Pede ao atalho para encerrar (POST local). Best-effort: nunca lança. */
  private async requestQuit(): Promise<void> {
    try {
      await fetch('http://localhost:4299/quit', { method: 'POST' });
    } catch {
      /* sem servidor local: cai no window.close() do fallback */
    }
  }

  /** Reabre o pop-up de atualização (botão "Atualização disponível" do topo). */
  openUpdate(): void {
    void this.updates.openDialog();
  }

  /** Isolado para facilitar o spy em testes. */
  protected closeWindow(): void {
    window.close();
  }

  private async offerResume(snapshot: Snapshot): Promise<void> {
    const { total, ready } = summarize(snapshot);
    const choice = await this.modal.showChoices<ResumeDecision>({
      title: 'Retomar o último lote?',
      message: `${total} ${plural(total, 'botton', 'bottons')}, ${ready} ${plural(ready, 'pronto', 'prontos')}`,
      choices: [
        { value: 'restore', label: 'Retomar', variant: 'primary' },
        { value: 'discard', label: 'Descartar', variant: 'secondary' },
      ],
    });
    if (choice !== 'restore') {
      await this.batch.clearPersisted();
      return;
    }
    await this.batch.restore(snapshot);
    if (this.router.url.startsWith('/app/upload')) {
      await this.router.navigate(['/app/batch']);
    }
  }

  private async decide(): Promise<void> {
    const choice = await this.askDecision();
    if (choice === 'print') {
      await this.router.navigate(['/app/impressao']);
    } else if (choice === 'edit') {
      await this.router.navigate(['/app/batch']);
    } else if (choice === 'zip') {
      await this.downloadZip();
      await this.decide(); // ainda pode imprimir / limpar (agora sem aviso extra)
    } else if (choice === 'clear') {
      await this.clearBatch();
    }
  }

  private askDecision(): Promise<BatchDecision | null> {
    const total = this.batch.items().length;
    const ready = this.batch.artesProntas();
    const choices: ModalChoice<BatchDecision>[] = [
      { value: 'print', label: 'Ir para impressão', variant: 'primary' },
    ];
    if (ready > 0) {
      choices.push({ value: 'zip', label: 'Baixar ZIP', variant: 'secondary' });
    }
    choices.push(
      { value: 'edit', label: 'Continuar editando', variant: 'secondary' },
      { value: 'clear', label: 'Apagar e começar outro', variant: 'danger' },
    );
    return this.modal.showChoices<BatchDecision>({
      title: `Você tem ${total} ${plural(total, 'botton', 'bottons')} (${ready} ${plural(ready, 'pronto', 'prontos')})`,
      message: this.batch.savedToZip()
        ? 'O ZIP já foi baixado. O que deseja fazer com este lote?'
        : 'O que deseja fazer com este lote antes de começar outro?',
      choices,
    });
  }

  private async downloadZip(): Promise<void> {
    try {
      const { zipped } = await this.batch.exportZip();
      if (zipped > 0) {
        this.toast.success(`ZIP com ${zipped} arquivo(s) gerado.`);
      } else {
        this.toast.error('Nenhuma arte pronta para baixar.');
      }
    } catch (err) {
      this.toast.error((err as Error).message);
    }
  }

  private async clearBatch(): Promise<void> {
    if (this.batch.artesProntas() > 0 && !this.batch.savedToZip()) {
      const ok = await this.modal.showConfirm({
        title: 'Apagar o lote?',
        message: `Isso apaga ${this.batch.items().length} bottons. Continuar?`,
        confirmLabel: 'Apagar',
        danger: true,
      });
      if (!ok) {
        return;
      }
    }
    this.batch.reset();
    await this.router.navigate(['/app/upload']);
  }

  private syncContext(): void {
    let child = this.route.firstChild;
    while (child?.firstChild) {
      child = child.firstChild;
    }
    const data = child?.snapshot?.data ?? {};
    this.batchMode.set(data['batch'] === true);
    this.contextualMode.set(data['contextual'] === true);
    this.manageMode.set(data['manage'] === true);
    this.manageBackgroundsMode.set(data['manageBackgrounds'] === true);
    this.manageFramesMode.set(data['manageFrames'] === true);
    this.printMode.set(data['print'] === true);
    this.uploadActive.set(this.router.url.startsWith('/app/upload'));
  }
}
