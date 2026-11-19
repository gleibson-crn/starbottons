/**
 * Ponte para o backend local (ADR-033), exposta pelo preload do Electron em
 * `window.sb`. No modo web (ng serve puro), `window.sb` não existe e
 * `localBackend()` devolve `null` → os serviços caem no caminho Supabase.
 */

/** Linha de fundo como o SQLite devolve (snake_case). */
export interface LocalBackgroundRow {
  readonly id: string;
  readonly name: string;
  readonly storage_path: string;
  readonly mime: string;
  readonly bytes: number | null;
  readonly width_px: number | null;
  readonly height_px: number | null;
  readonly created_at: string;
}

/** Dados p/ salvar um fundo no backend local (bytes já tratados no renderer). */
export interface LocalBackgroundInput {
  readonly name: string;
  readonly bytes: ArrayBuffer;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

/** API exposta em `window.sb` pelo preload. Cresce a cada serviço migrado. */
export interface LocalBackendApi {
  readonly printSpecs: { list(): Promise<readonly unknown[]> };
  readonly backgrounds: {
    list(): Promise<readonly LocalBackgroundRow[]>;
    save(input: LocalBackgroundInput): Promise<LocalBackgroundRow>;
    remove(id: string): Promise<void>;
  };
  readonly media: { read(name: string): Promise<Uint8Array | null> };
}

/** A API local se rodando no Electron (preload), senão `null` (modo web). */
export function localBackend(): LocalBackendApi | null {
  return (globalThis as unknown as { sb?: LocalBackendApi }).sb ?? null;
}
