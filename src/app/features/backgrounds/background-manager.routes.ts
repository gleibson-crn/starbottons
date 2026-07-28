import { Routes } from '@angular/router';
import { BackgroundsManagerPage } from './backgrounds-manager.page';

/**
 * Área curadora de fundos do botton. Sob `/app` — herda o authGuard do pai.
 * Sem guard próprio: o usuário cadastra fundos independentemente de ter um
 * botton gerado.
 */
const backgroundManagerRoutes: Routes = [
  { path: '', component: BackgroundsManagerPage },
];

export default backgroundManagerRoutes;
