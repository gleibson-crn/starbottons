import { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { ShellPage } from './shell/shell.page';

/**
 * Rotas raiz. `/auth` é pública; tudo sob `/app` exige sessão (authGuard) e
 * roda dentro do ShellPage (stepper persistente). Cada passo faz lazy-load da
 * sua feature e declara `data.step` para sincronizar o Stepper.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'app/upload' },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes'),
  },
  {
    path: 'app',
    component: ShellPage,
    canActivate: [authGuard],
    children: [
      {
        path: 'upload',
        data: { step: 0 },
        loadChildren: () => import('./features/upload/upload.routes'),
      },
      {
        path: 'selection',
        data: { step: 1 },
        loadChildren: () => import('./features/selection/selection.routes'),
      },
      {
        path: 'editor',
        data: { step: 2 },
        loadChildren: () => import('./features/editor/editor.routes'),
      },
      {
        path: 'processing',
        data: { step: 2 },
        loadChildren: () => import('./features/generation/generation.routes'),
      },
      {
        path: 'batch',
        data: { batch: true },
        loadChildren: () => import('./features/batch/batch.routes'),
      },
      {
        path: 'result',
        data: { step: 3 },
        loadChildren: () => import('./features/result/result.routes'),
      },
      {
        path: 'mockup',
        data: { contextual: true },
        loadChildren: () =>
          import('./features/contextual-mockup/contextual-mockup.routes'),
      },
      { path: '', pathMatch: 'full', redirectTo: 'upload' },
    ],
  },
  { path: '**', redirectTo: 'app/upload' },
];
