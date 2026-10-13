import {
  afterNextRender,
  Component,
  inject
} from '@angular/core';

import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { ConexionService } from './Services/conexion.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly conexionService = inject(ConexionService);

  constructor() {
    afterNextRender(() => {
      this.conexionService.probarConexion().subscribe({
        next: respuesta => {
          console.log('Conexión con el backend correcta:', respuesta);
        },
        error: error => {
          console.error('No se pudo conectar con el backend:', error);
        }
      });
    });
  }
}
