import { Routes } from '@angular/router';
import { mockupGuard } from './mockup.guard';
import { MockupContextualPage } from './mockup-contextual.page';

const contextualMockupRoutes: Routes = [
  { path: ':itemId', canActivate: [mockupGuard], component: MockupContextualPage },
  { path: '', pathMatch: 'full', redirectTo: '/app/batch' },
];

export default contextualMockupRoutes;
