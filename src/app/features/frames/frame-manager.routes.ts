import { Routes } from '@angular/router';
import { FramesManagerPage } from './frames-manager.page';

/**
 * Área curadora de molduras do botton. Sob `/app` — herda o authGuard do pai.
 * Sem guard próprio: o usuário cadastra molduras independentemente de ter um
 * botton gerado.
 */
const frameManagerRoutes: Routes = [
  { path: '', component: FramesManagerPage },
];

export default frameManagerRoutes;
