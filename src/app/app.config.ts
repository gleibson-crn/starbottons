import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';

// Projeto zoneless (sem zone.js): a detecção de mudança precisa ser habilitada
// explicitamente, senão a view não re-renderiza após navegação/async (signals
// disparam o refresh via este provider).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
  ],
};
