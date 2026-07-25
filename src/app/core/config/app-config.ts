import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Environment } from '../../../environments/environment.type';

/**
 * Token de configuração da aplicação. Injeta o `environment` desacoplando
 * os serviços do import direto — facilita override em testes.
 */
export const APP_CONFIG = new InjectionToken<Environment>('APP_CONFIG', {
  providedIn: 'root',
  factory: (): Environment => environment,
});
