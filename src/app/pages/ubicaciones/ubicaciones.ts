import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { EquipoService } from '../../Services/equipo.service';

interface EquipoUbicacion {
  id?: number;
  etiqueta: string;
  tipo: string;
  marca: string;
  modelo: string;
  usuario: string;
  ubicacion: string;
  area?: string | null;
  estado: string;
}

interface ResumenUbicacion {
  clave: string;
  nombre: string;
  total: number;
  activos: number;
  disponibles: number;
  reparacion: number;
  areas: number;
}

interface ResumenArea {
  clave: string;
  nombre: string;
  total: number;
}

@Component({
  selector: 'app-ubicaciones',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ubicaciones.html',
  styleUrl: './ubicaciones.css',
})
export class Ubicaciones {
  private readonly equipoService = inject(EquipoService);

  readonly equipos = signal<EquipoUbicacion[]>([]);
  readonly cargando = signal(true);
  readonly error = signal('');

  readonly busqueda = signal('');
  readonly busquedaEquipo = signal('');

  // null significa que todavía no se ha seleccionado una ubicación.
  readonly ubicacionSeleccionada = signal<string | null>(null);

  // null permite mostrar todas las áreas de la ubicación.
  readonly areaSeleccionada = signal<string | null>(null);

  readonly ubicaciones = computed<ResumenUbicacion[]>(() => {
    const grupos = new Map<
      string,
      {
        resumen: ResumenUbicacion;
        areas: Set<string>;
      }
    >();

    for (const equipo of this.equipos()) {
      const nombre = (equipo.ubicacion ?? '').trim();
      const clave = this.normalizar(nombre);

      let grupo = grupos.get(clave);

      if (!grupo) {
        grupo = {
          resumen: {
            clave,
            nombre: nombre || 'Sin ubicación asignada',
            total: 0,
            activos: 0,
            disponibles: 0,
            reparacion: 0,
            areas: 0,
          },
          areas: new Set<string>(),
        };

        grupos.set(clave, grupo);
      }

      grupo.resumen.total++;

      if (equipo.estado === 'activo') {
        grupo.resumen.activos++;
      }

      if (equipo.estado === 'disponible') {
        grupo.resumen.disponibles++;
      }

      if (equipo.estado === 'reparacion') {
        grupo.resumen.reparacion++;
      }

      const area = this.normalizar(equipo.area ?? '');

      if (area) {
        grupo.areas.add(area);
      }
    }

    return [...grupos.values()]
      .map(grupo => ({
        ...grupo.resumen,
        areas: grupo.areas.size,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  readonly ubicacionesFiltradas = computed(() => {
    const texto = this.normalizar(this.busqueda());

    return this.ubicaciones().filter(ubicacion =>
      this.normalizar(ubicacion.nombre).includes(texto)
    );
  });

  readonly resumen = computed(() => ({
    ubicaciones: this.ubicaciones().filter(
      ubicacion => ubicacion.clave !== ''
    ).length,
    equipos: this.equipos().length,
    activos: this.equipos().filter(
      equipo => equipo.estado === 'activo'
    ).length,
    sinUbicacion: this.equipos().filter(
      equipo => !this.normalizar(equipo.ubicacion ?? '')
    ).length,
  }));

  readonly detalleUbicacion = computed(() =>
    this.ubicaciones().find(
      ubicacion => ubicacion.clave === this.ubicacionSeleccionada()
    ) ?? null
  );

  readonly equiposDeUbicacion = computed(() => {
    const seleccionada = this.ubicacionSeleccionada();

    if (seleccionada === null) {
      return [];
    }

    return this.equipos().filter(
      equipo =>
        this.normalizar(equipo.ubicacion ?? '') === seleccionada
    );
  });

  readonly areasDeUbicacion = computed<ResumenArea[]>(() => {
    const grupos = new Map<string, ResumenArea>();

    for (const equipo of this.equiposDeUbicacion()) {
      const nombre = (equipo.area ?? '').trim();
      const clave = this.normalizar(nombre);
      const existente = grupos.get(clave);

      if (existente) {
        existente.total++;
      } else {
        grupos.set(clave, {
          clave,
          nombre: nombre || 'Sin área asignada',
          total: 1,
        });
      }
    }

    return [...grupos.values()].sort(
      (a, b) =>
        b.total - a.total ||
        a.nombre.localeCompare(b.nombre, 'es')
    );
  });

  readonly equiposFiltrados = computed(() => {
    const texto = this.normalizar(this.busquedaEquipo());
    const area = this.areaSeleccionada();

    return this.equiposDeUbicacion().filter(equipo => {
      const coincideArea =
        area === null ||
        this.normalizar(equipo.area ?? '') === area;

      const contenido = this.normalizar([
        equipo.etiqueta,
        equipo.tipo,
        equipo.marca,
        equipo.modelo,
        equipo.usuario,
        equipo.area ?? '',
        this.nombreEstado(equipo.estado),
      ].join(' '));

      return coincideArea && contenido.includes(texto);
    });
  });

  constructor() {
    afterNextRender(() => {
      void this.cargarUbicaciones();
    });
  }

  async cargarUbicaciones(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');

    try {
      const equipos = await firstValueFrom(
        this.equipoService.listarEquipos()
      );

      this.equipos.set(equipos);

      const ubicacion = this.ubicacionSeleccionada();

      if (
        ubicacion !== null &&
        !this.ubicaciones().some(item => item.clave === ubicacion)
      ) {
        this.volver();
      }

      const area = this.areaSeleccionada();

      if (
        area !== null &&
        !this.areasDeUbicacion().some(item => item.clave === area)
      ) {
        this.areaSeleccionada.set(null);
      }
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 0
          ? 'No se pudo conectar con el backend. Comprueba que esté ejecutándose.'
          : 'No fue posible consultar las ubicaciones.'
      );
    } finally {
      this.cargando.set(false);
    }
  }

  seleccionarUbicacion(ubicacion: ResumenUbicacion): void {
    this.ubicacionSeleccionada.set(ubicacion.clave);
    this.areaSeleccionada.set(null);
    this.busquedaEquipo.set('');
  }

  seleccionarArea(clave: string | null): void {
    this.areaSeleccionada.set(clave);
  }

  limpiarFiltrosEquipos(): void {
    this.areaSeleccionada.set(null);
    this.busquedaEquipo.set('');
  }

  volver(): void {
    this.ubicacionSeleccionada.set(null);
    this.limpiarFiltrosEquipos();
  }

  nombreEstado(estado: string): string {
    const nombres: Record<string, string> = {
      disponible: 'Disponible',
      activo: 'Asignado / activo',
      nuevo: 'Nuevo',
      danado: 'Dañado',
      reparacion: 'En reparación',
      reparado: 'Reparado',
      desechado: 'Dado de baja',
    };

    return nombres[estado] ?? estado;
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
