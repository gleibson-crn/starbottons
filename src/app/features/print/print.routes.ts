import { Routes } from '@angular/router';
import { PrintPage } from './print.page';

/**
 * Área de Impressão (Estágio 1). Sob `/app` — herda o authGuard do pai. Monta
 * a folha A4 a partir das artes já geradas no lote (BatchStore).
 */
const printRoutes: Routes = [{ path: '', component: PrintPage }];

export default printRoutes;
