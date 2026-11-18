import { inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import type { StyleProvider } from './style-provider';

/**
 * Trilha 2 (ADR-020) — registro de provedores de style transfer por IA.
 *
 * DESLIGADO por default: `enabled()` lê `APP_CONFIG.styleTransfer?.enabled`
 * (o token injeta o `environment`, mas é sobreponível em testes), que é `false`
 * (ou ausente) em todos os ambientes versionados. Nenhum provedor
 * é registrado no boot. Enquanto `enabled()` for false / não houver provedor
 * configurado, a UI de IA não aparece e NENHUM caminho de rede é alcançável —
 * o LOCAL-ONLY permanece intacto.
 *
 * Habilitar exige decisão do dono (provedor/conta, orçamento por imagem, aceite
 * de IP e privacidade, pois a imagem sai da máquina) — ver ADR-020.
 */
@Injectable({ providedIn: 'root' })
export class StyleProviderRegistry {
  /** Config injetável (APP_CONFIG provê o `environment`; testes podem sobrepor). */
  private readonly config = inject(APP_CONFIG);
  private readonly providers = new Map<string, StyleProvider>();

  /** Registra (ou substitui) um provedor pelo seu `id`. */
  register(provider: StyleProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** Provedor por id, ou `null` se não registrado. */
  get(id: string): StyleProvider | null {
    return this.providers.get(id) ?? null;
  }

  /** Todos os provedores registrados (vazio por default). */
  list(): readonly StyleProvider[] {
    return [...this.providers.values()];
  }

  /**
   * A integração de IA está habilitada por configuração?
   * Default efetivo `false` — inclusive se `styleTransfer` estiver ausente.
   */
  enabled(): boolean {
    return this.config.styleTransfer?.enabled ?? false;
  }

  /**
   * A UI de estilo por IA deve ser mostrada? Só quando habilitada E existe um
   * provedor efetivamente configurado (com chave/endpoint). Default: false.
   */
  uiAvailable(): boolean {
    return this.enabled() && this.list().some((p) => p.isConfigured());
  }
}
