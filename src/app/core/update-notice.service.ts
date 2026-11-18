import { inject, Injectable } from '@angular/core';
import { ModalService } from './modal';
import { APP_VERSION } from './app-version';
import { RELEASE_NOTES as RELEASES, type ReleaseNote } from './release-notes';
import { compareVersions } from './version';

/** Chave do localStorage com a última versão cujas novidades já foram vistas. */
export const LAST_SEEN_VERSION_KEY = 'sb.lastSeenVersion';

export { compareVersions };

function readSeen(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_SEEN_VERSION_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeSeen(version: string): void {
  try {
    globalThis.localStorage?.setItem(LAST_SEEN_VERSION_KEY, version);
  } catch {
    /* best-effort */
  }
}

/**
 * UpdateNoticeService — avisa UMA vez por versão nova ("Star Bottons atualizado")
 * listando as novidades das versões puladas. Só notifica: não baixa nem aplica nada.
 * Primeira instalação (sem versão guardada) grava em silêncio, sem modal.
 */
@Injectable({ providedIn: 'root' })
export class UpdateNoticeService {
  private readonly modal = inject(ModalService);

  /** Notas das versões > `lastSeen` e <= `current`, da mais nova para a mais antiga. */
  notesSince(
    lastSeen: string,
    current: string = APP_VERSION,
    releases: readonly ReleaseNote[] = RELEASES,
  ): ReleaseNote[] {
    return releases
      .filter((r) => compareVersions(r.version, lastSeen) > 0 && compareVersions(r.version, current) <= 0)
      .sort((a, b) => compareVersions(b.version, a.version));
  }

  /**
   * Chamar uma vez no boot do shell. Nunca lança.
   * Devolve `true` quando a versão acabou de subir (pós-update): o chamador
   * usa isso para NÃO oferecer um novo update no mesmo boot.
   */
  async checkAndNotify(
    current: string = APP_VERSION,
    releases: readonly ReleaseNote[] = RELEASES,
  ): Promise<boolean> {
    try {
      const seen = readSeen();
      if (seen === null) {
        writeSeen(current); // instalação do zero não é "atualização"
        return false;
      }
      if (compareVersions(current, seen) <= 0) {
        return false;
      }
      const news = this.notesSince(seen, current, releases);
      if (news.length > 0) {
        await this.modal.showAlert({
          title: 'Star Bottons atualizado',
          message: this.format(news),
        });
      }
      writeSeen(current);
      return true;
    } catch {
      /* aviso é best-effort: nunca quebra o boot */
      return false;
    }
  }

  private format(news: readonly ReleaseNote[]): string {
    return news
      .map((r) => `Versão ${r.version}\n${r.notes.map((n) => `• ${n}`).join('\n')}`)
      .join('\n\n');
  }
}
