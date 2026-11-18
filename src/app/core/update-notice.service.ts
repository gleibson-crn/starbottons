import { inject, Injectable } from '@angular/core';
import { ModalService } from './modal';
import { APP_VERSION, RELEASES, type ReleaseNote } from './release-notes';

/** Chave do localStorage com a última versão cujas novidades já foram vistas. */
export const LAST_SEEN_VERSION_KEY = 'sb.lastSeenVersion';

function parts(version: string): number[] {
  return version.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** Comparação semver simples, NUMÉRICA por segmento: negativo se a<b, 0 se igual, positivo se a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

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

  /** Chamar uma vez no boot do shell. Nunca lança. */
  async checkAndNotify(
    current: string = APP_VERSION,
    releases: readonly ReleaseNote[] = RELEASES,
  ): Promise<void> {
    try {
      const seen = readSeen();
      if (seen === null) {
        writeSeen(current); // instalação do zero não é "atualização"
        return;
      }
      if (compareVersions(current, seen) <= 0) {
        return;
      }
      const news = this.notesSince(seen, current, releases);
      if (news.length > 0) {
        await this.modal.showAlert({
          title: 'Star Bottons atualizado',
          message: this.format(news),
        });
      }
      writeSeen(current);
    } catch {
      /* aviso é best-effort: nunca quebra o boot */
    }
  }

  private format(news: readonly ReleaseNote[]): string {
    return news
      .map((r) => `Versão ${r.version}\n${r.notes.map((n) => `• ${n}`).join('\n')}`)
      .join('\n\n');
  }
}
