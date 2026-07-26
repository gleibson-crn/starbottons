import { Routes } from '@angular/router';
import { MockupManagerPage } from './mockup-manager.page';

/**
 * Área curadora de mockups. Sob `/app` — herda o authGuard do pai. NÃO usa o
 * mockupGuard: aqui o usuário cadastra cenários SEM precisar de um botton gerado.
 */
const mockupManagerRoutes: Routes = [{ path: '', component: MockupManagerPage }];

export default mockupManagerRoutes;
