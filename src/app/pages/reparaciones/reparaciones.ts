import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ReporteFallaService } from '../../Services/reporte-falla.service';

import type {
  PrioridadReporte,
  ReporteFalla,
  SeguimientoReporte,
} from '../../Services/reporte-falla.service';

@Component({
  selector: 'app-reparaciones',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './reparaciones.html',
  styleUrl: './reparaciones.css',
})
export class Reparaciones {
  private readonly reporteService = inject(ReporteFallaService);

  readonly reportes = signal<ReporteFalla[]>([]);
  readonly seleccionado = signal<ReporteFalla | null>(null);

  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly conexionLista = signal(false);

  readonly error = signal('');
  readonly errorFormulario = signal('');
  readonly mensaje = signal('');

  readonly busqueda = signal('');
  readonly filtroPrioridad = signal<PrioridadReporte | ''>('');

  readonly prioridades: {
    valor: PrioridadReporte;
    nombre: string;
  }[] = [
    { valor: 'alta', nombre: 'Alta' },
    { valor: 'media', nombre: 'Media' },
    { valor: 'baja', nombre: 'Baja' },
  ];

  diagnostico = '';
  solucion = '';
  finalizar = false;

  readonly reparaciones = computed(() =>
    this.reportes()
      .filter(reporte => reporte.estado === 'reparacion')
      .sort((a, b) => {
        const orden: Record<PrioridadReporte, number> = {
          alta: 0,
          media: 1,
          baja: 2,
        };

        return (
          orden[a.prioridad] - orden[b.prioridad] ||
          a.fechaReporte.localeCompare(b.fechaReporte)
        );
      })
  );

  readonly resumen = computed(() => {
    const reparaciones = this.reparaciones();

    return {
      total: reparaciones.length,
      alta: reparaciones.filter(
        reporte => reporte.prioridad === 'alta'
      ).length,
      media: reparaciones.filter(
        reporte => reporte.prioridad === 'media'
      ).length,
      baja: reparaciones.filter(
        reporte => reporte.prioridad === 'baja'
      ).length,
    };
  });

  readonly reparacionesFiltradas = computed(() => {
    const texto = this.normalizar(this.busqueda());
    const prioridad = this.filtroPrioridad();

    return this.reparaciones().filter(reporte => {
      const contenido = this.normalizar([
        reporte.folio,
        reporte.equipo.etiqueta,
        reporte.equipo.tipo,
        reporte.equipo.marca,
        reporte.equipo.modelo,
        reporte.equipo.serie ?? '',
        reporte.equipo.ubicacion,
        reporte.equipo.area ?? '',
        reporte.reportadoPor,
        reporte.descripcion,
        reporte.diagnostico ?? '',
        reporte.solucion ?? '',
      ].join(' '));

      return (
        (!prioridad || reporte.prioridad === prioridad) &&
        contenido.includes(texto)
      );
    });
  });

  constructor() {
    afterNextRender(() => {
      void this.cargarReparaciones();
    });
  }

  async cargarReparaciones(): Promise<void> {
    if (this.guardando() || this.cargando()) return;

    this.cargando.set(true);
    this.conexionLista.set(false);
    this.error.set('');

    try {
      const reportes = await firstValueFrom(
        this.reporteService.listar()
      );

      this.reportes.set(reportes);
      this.conexionLista.set(true);
    } catch (error) {
      this.error.set(this.mensajeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  seleccionarPrioridad(prioridad: PrioridadReporte | ''): void {
    this.filtroPrioridad.set(prioridad);
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroPrioridad.set('');
  }

  atender(reporte: ReporteFalla): void {
    if (
      this.guardando() ||
      this.cargando() ||
      !this.conexionLista() ||
      reporte.estado !== 'reparacion'
    ) {
      return;
    }

    this.seleccionado.set(reporte);
    this.diagnostico = reporte.diagnostico ?? '';
    this.solucion = reporte.solucion ?? '';
    this.finalizar = false;

    this.errorFormulario.set('');
    this.mensaje.set('');
  }

  cerrarDetalle(): void {
    if (this.guardando()) return;

    this.seleccionado.set(null);
    this.diagnostico = '';
    this.solucion = '';
    this.finalizar = false;
    this.errorFormulario.set('');
  }

  async guardarSeguimiento(): Promise<void> {
    if (
      this.guardando() ||
      this.cargando() ||
      !this.conexionLista()
    ) {
      return;
    }

    const reporte = this.seleccionado();

    if (!reporte || reporte.estado !== 'reparacion') return;

    const diagnostico = this.diagnostico.trim();
    const solucion = this.solucion.trim();

    this.errorFormulario.set('');

    if (!diagnostico) {
      this.errorFormulario.set('Escribe el diagnóstico del equipo.');
      return;
    }

    if (diagnostico.length > 2000 || solucion.length > 2000) {
      this.errorFormulario.set(
        'El diagnóstico y la solución admiten hasta 2000 caracteres cada uno.'
      );
      return;
    }

    if (this.finalizar && !solucion) {
      this.errorFormulario.set(
        'Describe la solución antes de finalizar la reparación.'
      );
      return;
    }

    const datos: SeguimientoReporte = {
      estado: this.finalizar ? 'resuelto' : 'reparacion',
      diagnostico,
      solucion,
    };

    this.guardando.set(true);
    this.mensaje.set('');

    try {
      const actualizado = await firstValueFrom(
        this.reporteService.actualizar(reporte.id, datos)
      );

      this.reportes.update(reportes =>
        reportes.map(item => {
          if (item.id === actualizado.id) {
            return actualizado;
          }

          return item.equipo.id === actualizado.equipo.id
            ? { ...item, equipo: actualizado.equipo }
            : item;
        })
      );

      if (actualizado.estado === 'resuelto') {
        this.seleccionado.set(null);
        this.diagnostico = '';
        this.solucion = '';
        this.finalizar = false;

        this.mensaje.set(
          `${actualizado.folio} resuelto. ` +
          'Puedes consultar el diagnóstico y la solución en Reportes.'
        );
      } else {
        this.seleccionado.set(actualizado);
        this.diagnostico = actualizado.diagnostico ?? '';
        this.solucion = actualizado.solucion ?? '';

        this.mensaje.set(
          `Avances de ${actualizado.folio} guardados. ` +
          'El reporte continúa en reparación.'
        );
      }
    } catch (error) {
      this.errorFormulario.set(this.mensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  nombrePrioridad(prioridad: string): string {
    return this.prioridades.find(
      item => item.valor === prioridad
    )?.nombre ?? prioridad;
  }

  fecha(valor: string | null | undefined): string {
    if (!valor) return '—';

    const fecha = new Date(valor);

    return Number.isNaN(fecha.getTime())
      ? '—'
      : fecha.toLocaleString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return (
          'No se pudo conectar con el backend. ' +
          'Comprueba que esté ejecutándose.'
        );
      }

      const cuerpo: unknown = error.error;

      if (cuerpo && typeof cuerpo === 'object') {
        const mensaje = (cuerpo as Record<string, unknown>)['mensaje'];

        if (typeof mensaje === 'string' && mensaje.trim()) {
          return mensaje;
        }
      }

      if (error.status === 404) {
        return 'No se encontró el reporte o el servicio solicitado.';
      }

      if (error.status === 409) {
        return (
          'El reporte cambió o ya fue resuelto. ' +
          'Cierra el detalle y pulsa Actualizar.'
        );
      }
    }

    return (
      'No fue posible completar la operación. ' +
      'Revisa el mensaje del backend.'
    );
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
