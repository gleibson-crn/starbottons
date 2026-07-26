import { Routes } from '@angular/router';
import { mockupGuard } from './mockup.guard';
import { MockupContextualPage } from './mockup-contextual.page';

const contextualMockupRoutes: Routes = [
  { path: '', canActivate: [mockupGuard], component: MockupContextualPage },
];

export default contextualMockupRoutes;
