import { Routes } from '@angular/router';
import { authGuard } from './core/auth';
import { ShellPage } from './shell/shell.page';

/**
 * Rotas raiz. `/auth` é pública; tudo sob `/app` exige sessão (authGuard) e
 * roda dentro do ShellPage. Fluxo único: o upload leva sempre ao grid de lote
 * (/app/batch). As paths do antigo fluxo single (selection/editor/processing/
 * result) foram removidas e redirecionam para /app/upload — links/bookmarks
 * antigos não quebram (não dão 404).
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
        loadChildren: () => import('./features/upload/upload.routes'),
      },
      {
        path: 'batch',
        data: { batch: true },
        loadChildren: () => import('./features/batch/batch.routes'),
      },
      {
        path: 'mockup',
        data: { contextual: true },
        loadChildren: () =>
          import('./features/mockup/contextual-mockup.routes'),
      },
      {
        path: 'mockups',
        data: { manage: true },
        loadChildren: () =>
          import('./features/mockup/mockup-manager.routes'),
      },
      // Redirects das paths do antigo fluxo single → fluxo único (upload).
      { path: 'selection', pathMatch: 'full', redirectTo: 'upload' },
      { path: 'editor', pathMatch: 'full', redirectTo: 'upload' },
      { path: 'processing', pathMatch: 'full', redirectTo: 'upload' },
      { path: 'result', pathMatch: 'full', redirectTo: 'upload' },
      { path: '', pathMatch: 'full', redirectTo: 'upload' },
    ],
  },
  { path: '**', redirectTo: 'app/upload' },
];
