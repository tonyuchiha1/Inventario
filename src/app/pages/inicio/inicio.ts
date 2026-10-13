import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';

import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { EquipoService } from '../../Services/equipo.service';

interface EquipoResumen {
  estado: string;
  ubicacion: string;
  area?: string | null;
}

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio {
  private readonly equipoService = inject(EquipoService);

  readonly equipos = signal<EquipoResumen[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');

  readonly resumen = computed(() => {
    const equipos = this.equipos();

    const contar = (estado: string): number =>
      equipos.filter(equipo => equipo.estado === estado).length;

    const ubicaciones = new Set(
      equipos
        .map(equipo => this.normalizar(equipo.ubicacion ?? ''))
        .filter(Boolean)
    );

    return {
      total: equipos.length,
      activos: contar('activo'),
      disponibles: contar('disponible'),
      nuevos: contar('nuevo'),
      danados: contar('danado'),
      reparacion: contar('reparacion'),
      reparados: contar('reparado'),
      desechados: contar('desechado'),
      ubicaciones: ubicaciones.size,
    };
  });

  readonly equiposPorArea = computed(() => {
    const grupos = new Map<
      string,
      {
        area: string;
        cantidad: number;
        filtro: string;
      }
    >();

    for (const equipo of this.equipos()) {
      const area = (equipo.area ?? '').trim();
      const clave = this.normalizar(area);
      const existente = grupos.get(clave);

      if (existente) {
        existente.cantidad++;
      } else {
        grupos.set(clave, {
          area: area || 'Sin área asignada',
          cantidad: 1,
          filtro: area || '__sin_area__',
        });
      }
    }

    return [...grupos.values()].sort(
      (a, b) =>
        b.cantidad - a.cantidad ||
        a.area.localeCompare(b.area, 'es')
    );
  });

  constructor() {
    afterNextRender(() => {
      void this.cargarResumen();
    });
  }

  async cargarResumen(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');

    try {
      const equipos = await firstValueFrom(
        this.equipoService.listarEquipos()
      );

      this.equipos.set(equipos);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 0) {
        this.error.set(
          'No se pudo conectar con el backend. ' +
          'Comprueba que esté ejecutándose y vuelve a intentar.'
        );
      } else {
        this.error.set(
          'No fue posible consultar el resumen del inventario.'
        );
      }
    } finally {
      this.cargando.set(false);
    }
  }

  private normalizar(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }
}
