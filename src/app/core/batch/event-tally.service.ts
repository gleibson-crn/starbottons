import { computed, Injectable, signal } from '@angular/core';

/** Chave do localStorage do contador de evento. */
export const EVENT_TALLY_KEY = 'sb.event.tally';

function load(): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(EVENT_TALLY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === 'string' && v !== ''));
    }
  } catch {
    /* storage indisponível/corrompido: começa vazio */
  }
  return new Set();
}

function save(labels: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(EVENT_TALLY_KEY, JSON.stringify([...labels]));
  } catch {
    /* best-effort */
  }
}

/**
 * EventTallyService — conjunto PERSISTENTE (localStorage) das senhas (seqLabel)
 * já produzidas no evento. Idempotente por senha: regenerar não duplica.
 */
@Injectable({ providedIn: 'root' })
export class EventTallyService {
  private readonly labels = signal<ReadonlySet<string>>(load());

  readonly produced = this.labels.asReadonly();
  readonly count = computed(() => this.labels().size);

  record(label: string): void {
    if (!label || this.labels().has(label)) {
      return;
    }
    const next = new Set(this.labels()).add(label);
    this.labels.set(next);
    save(next);
  }

  clear(): void {
    this.labels.set(new Set());
    save(new Set());
  }
}
