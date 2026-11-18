import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AutoLoginService } from './core/auth';
import { provideStyleTransfer } from './core/style-provider';

// Projeto zoneless (sem zone.js): a detecção de mudança precisa ser habilitada
// explicitamente, senão a view não re-renderiza após navegação/async (signals
// disparam o refresh via este provider).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    // Login invisível (local-only): resolve ANTES da navegação inicial/guard.
    provideAppInitializer(() => inject(AutoLoginService).run()),
    // Trilha 2 (ADR-021): registro CONDICIONAL do provedor de IA — no-op (zero
    // rede) enquanto environment.styleTransfer.enabled === false (default).
    provideStyleTransfer(),
  ],
};
