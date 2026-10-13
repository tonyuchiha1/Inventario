import { Routes } from '@angular/router';
import { Inicio } from './pages/inicio/inicio';
import { Equipos } from './pages/equipos/equipos';
import { Ubicaciones } from './pages/ubicaciones/ubicaciones';
import { Reparaciones } from './pages/reparaciones/reparaciones';
import { Reportes } from './pages/reportes/reportes';

export const routes: Routes = [
  { path: '', component: Inicio },
  { path: 'equipos', component: Equipos },
  { path: 'ubicaciones', component: Ubicaciones },
  { path: 'reparaciones', component: Reparaciones },
  { path: 'reportes', component: Reportes },
  { path: '**', redirectTo: '' },
];
