import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { AiCreditStatus } from './ai-credit-status';
import { GeminiEdgeStyleProvider } from './gemini-edge-style-provider';
import { probeAiCredits } from './probe-ai-credits';
import { StyleProviderRegistry } from './registry';

/**
 * provideStyleTransfer (Trilha 2, ADR-021) — registro CONDICIONAL do provedor de
 * IA. No boot, injeta o `StyleProviderRegistry` e, SOMENTE se `registry.enabled()`
 * (ou seja, `environment.styleTransfer.enabled === true`), registra o
 * `GeminiEdgeStyleProvider` e JÁ dispara a verificação de créditos (probe) na
 * inicialização do app — assim, ao abrir o editor, o status já está pronto (sem
 * a espera de ~10s só quando a aba "Tratar" é acionada).
 *
 * A probe é FIRE-AND-FORGET: NÃO é aguardada (o initializer retorna void), para
 * não atrasar o bootstrap; o `AiCreditStatus` cacheia o resultado por sessão, e
 * o diálogo faz um `ensureChecked` idempotente como fallback (só reprova se o
 * status ainda estiver `unknown`, ex.: falha de rede no boot).
 *
 * Com a flag `false` (default em todos os ambientes versionados) NENHUM provedor
 * é registrado e o `GeminiEdgeStyleProvider` nunca é injetado/instanciado — logo
 * `registry.uiAvailable()` é `false`, a UI de IA fica invisível e NENHUM caminho
 * de rede à Edge é alcançável (nem a probe). O LOCAL-ONLY permanece intacto.
 */
export function provideStyleTransfer(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      const registry = inject(StyleProviderRegistry);
      if (!registry.enabled()) {
        return;
      }
      registry.register(inject(GeminiEdgeStyleProvider));
      // Verifica créditos JÁ no boot (uma vez por sessão). Fire-and-forget: não
      // bloqueia o bootstrap; erros alheios (rede) mantêm o status `unknown`.
      const provider = registry.list().find((p) => p.isConfigured());
      if (provider) {
        const credits = inject(AiCreditStatus);
        void credits.ensureChecked(() => probeAiCredits(provider));
      }
    }),
  ]);
}
