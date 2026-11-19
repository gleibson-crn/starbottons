import { inject, Injectable } from '@angular/core';
import { APP_VERSION } from './app-version';
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
        await this.offer(available);
      }
    } catch {
      /* nunca quebra o boot */
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
