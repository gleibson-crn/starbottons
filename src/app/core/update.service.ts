import { inject, Injectable, signal } from '@angular/core';
import { APP_VERSION } from './app-version';
import { RELEASE_NOTES } from './release-notes';
import { localBackend } from './local-backend/local-api';
import { ModalService } from './modal';
import { UpdateNoticeService } from './update-notice.service';
import { compareVersions } from './version';

/** Arquivo gerado pelo backend local SÓ quando existe versão maior. */
export const UPDATE_AVAILABLE_URL = '/update-available.json';
/** Endpoint local (somente localhost) que aplica a atualização. */
export const DO_UPDATE_URL = 'http://localhost:4299/do-update';

export interface UpdateAvailable {
  readonly latestVersion: string;
  readonly notes: readonly string[];
}

type UpdateChoice = 'now' | 'later';

/**
 * UpdateService — pop-up "Nova versão disponível" (antes do update) e orquestra
 * a exclusividade com o aviso "Atualizado!" (UpdateNoticeService): no mesmo boot
 * só um dos dois aparece. Tudo best-effort: nunca lança.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly modal = inject(ModalService);
  private readonly notice = inject(UpdateNoticeService);
  private checked = false;

  /**
   * Atualização disponível (ou `null`). O shell mostra um botão "Atualização
   * disponível" no topo enquanto isto estiver preenchido — assim, se o usuário
   * fechar o pop-up sem querer, reabre pelo botão (ver `openDialog`).
   */
  private readonly availableSignal = signal<UpdateAvailable | null>(null);
  readonly available = this.availableSignal.asReadonly();

  /** Versão baixada pelo electron-updater no desktop (.exe), aguardando instalar. */
  private readonly desktopVersion = signal<string | null>(null);

  /** Chamar UMA vez no init do shell (chamadas extras são ignoradas). */
  async checkOnBoot(current: string = APP_VERSION): Promise<void> {
    if (this.checked) {
      return;
    }
    this.checked = true;
    try {
      const justUpdated = await this.notice.checkAndNotify(current);
      if (justUpdated) {
        return; // A e B nunca no mesmo boot
      }
      const available = await this.fetchAvailable(current);
      if (available) {
        this.availableSignal.set(available); // liga o botão do topo
        await this.offer(available);
      }
    } catch {
      /* nunca quebra o boot */
    }
  }

  /**
   * Reabre o pop-up de atualização (chamado pelo botão do topo). No-op se não
   * há atualização conhecida. Útil quando o usuário fechou o pop-up sem querer.
   */
  async openDialog(): Promise<void> {
    const dv = this.desktopVersion();
    if (dv) {
      await this.offerDesktop(dv);
      return;
    }
    const available = this.availableSignal();
    if (available) {
      await this.offer(available);
    }
  }

  /**
   * Fluxo de update do DESKTOP (.exe via electron-updater): quando a nova versão
   * é baixada, avisa DENTRO do app (modal do sistema), em vez do toast nativo do
   * SO. Chamar UMA vez no boot do shell. No-op no modo web (sem `window.sb`).
   */
  registerDesktop(): void {
    const sb = localBackend();
    sb?.onUpdateDownloaded?.((info) => {
      const notes = RELEASE_NOTES.find((r) => r.version === info.version)?.notes ?? [];
      this.desktopVersion.set(info.version);
      this.availableSignal.set({ latestVersion: info.version, notes }); // liga o botão do topo
      void this.offerDesktop(info.version);
    });
  }

  /** Aviso "Atualização pronta" do desktop, com ação clara e feedback. */
  private async offerDesktop(version: string): Promise<void> {
    const notes = RELEASE_NOTES.find((r) => r.version === version)?.notes ?? [];
    const body = notes.length ? notes.map((n) => `• ${n}`).join('\n') + '\n\n' : '';
    const choice = await this.modal.showChoices<UpdateChoice>({
      title: `Atualização pronta (v${version})`,
      message:
        body +
        'Reiniciar agora para atualizar? O app fecha e reabre sozinho, sem janela de instalação. Se escolher "Depois", ela será instalada quando você fechar o aplicativo.',
      dismissible: false,
      choices: [
        { value: 'now', label: 'Reiniciar e atualizar', variant: 'primary' },
        { value: 'later', label: 'Depois', variant: 'secondary' },
      ],
    });
    if (choice === 'now') {
      await this.installDesktop();
    }
  }

  /** Dispara o reinício+instalação; se falhar, orienta a fechar e reabrir. */
  private async installDesktop(): Promise<void> {
    try {
      await localBackend()?.installUpdate?.();
    } catch {
      await this.modal.showAlert({
        title: 'Não foi possível reiniciar automaticamente',
        message: 'Feche e reabra o aplicativo para concluir a atualização.',
      });
    }
  }

  /** Lê e valida o JSON (o ng serve pode devolver o index.html como fallback). */
  async fetchAvailable(current: string = APP_VERSION): Promise<UpdateAvailable | null> {
    try {
      const res = await fetch(UPDATE_AVAILABLE_URL, { cache: 'no-store' });
      if (!res.ok) {
        return null;
      }
      const data: unknown = JSON.parse(await res.text());
      return this.parse(data, current);
    } catch {
      return null; // não-JSON (SPA fallback), offline, etc.
    }
  }

  private parse(data: unknown, current: string): UpdateAvailable | null {
    const d = data as { latestVersion?: unknown; notes?: unknown } | null;
    if (!d || typeof d.latestVersion !== 'string' || compareVersions(d.latestVersion, current) <= 0) {
      return null;
    }
    const notes = Array.isArray(d.notes) ? d.notes.filter((n): n is string => typeof n === 'string') : [];
    return { latestVersion: d.latestVersion, notes };
  }

  private async offer(update: UpdateAvailable): Promise<void> {
    const choice = await this.modal.showChoices<UpdateChoice>({
      title: `Nova versão disponível (v${update.latestVersion})`,
      message: update.notes.map((n) => `• ${n}`).join('\n'),
      // Não some por clique fora/Esc: o aviso só sai escolhendo um botão.
      dismissible: false,
      choices: [
        { value: 'now', label: 'Atualizar agora', variant: 'primary' },
        { value: 'later', label: 'Depois', variant: 'secondary' },
      ],
    });
    if (choice === 'now') {
      await this.applyUpdate(update.latestVersion);
    }
  }

  private async applyUpdate(targetVersion: string): Promise<void> {
    const ok = await this.requestUpdate(targetVersion);
    if (!ok) {
      await this.modal.showAlert({
        title: 'Atualização não iniciada',
        message: 'Não foi possível iniciar a atualização; tente pelo atalho/mais tarde.',
      });
      return;
    }
    this.closeWindow();
    await new Promise((r) => setTimeout(r, 300));
    await this.modal.showAlert({
      title: 'Atualização em andamento',
      message: 'Feche esta janela para concluir a atualização.',
    });
  }

  private async requestUpdate(targetVersion: string): Promise<boolean> {
    try {
      const res = await fetch(DO_UPDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Isolado para facilitar o spy em testes. */
  protected closeWindow(): void {
    window.close();
  }
}
