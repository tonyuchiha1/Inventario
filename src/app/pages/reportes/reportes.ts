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
import * as XLSX from 'xlsx';

import { EquipoService } from '../../Services/equipo.service';
import { ReporteFallaService } from '../../Services/reporte-falla.service';

import type {
  EquipoDelReporte,
  EstadoReporte,
  PrioridadReporte,
  ReporteFalla,
  SeguimientoReporte,
} from '../../Services/reporte-falla.service';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reportes.html',
  styleUrl: './reportes.css',
})
export class Reportes {
  private readonly equipoService = inject(EquipoService);
  private readonly reporteService = inject(ReporteFallaService);

  readonly equipos = signal<EquipoDelReporte[]>([]);

  readonly reportes = signal<ReporteFalla[]>([]);
  readonly seleccionado = signal<ReporteFalla | null>(null);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly conexionLista = signal(false);

  readonly error = signal('');
  readonly mensaje = signal('');
  readonly busqueda = signal('');
  readonly filtroEstado = signal('');

  readonly estados: {
    valor: EstadoReporte;
    nombre: string;
  }[] = [
    { valor: 'pendiente', nombre: 'Pendiente' },
    { valor: 'revision', nombre: 'En revisión' },
    { valor: 'reparacion', nombre: 'En reparación' },
    { valor: 'resuelto', nombre: 'Resuelto' },
  ];

  readonly prioridades: {
    valor: PrioridadReporte;
    nombre: string;
  }[] = [
    { valor: 'baja', nombre: 'Baja' },
    { valor: 'media', nombre: 'Media' },
    { valor: 'alta', nombre: 'Alta' },
  ];

  mostrarFormulario = false;
  busquedaEquipo = '';

  nuevo: {
    equipoId: number | null;
    reportadoPor: string;
    descripcion: string;
    prioridad: PrioridadReporte;
  } = this.formularioVacio();

  seguimiento: SeguimientoReporte = {
    estado: 'pendiente',
    diagnostico: '',
    solucion: '',
  };

  readonly resumen = computed(() => ({
    total: this.reportes().length,

    pendientes: this.reportes().filter(
      reporte => reporte.estado === 'pendiente'
    ).length,

    revision: this.reportes().filter(
      reporte => reporte.estado === 'revision'
    ).length,

    reparacion: this.reportes().filter(
      reporte => reporte.estado === 'reparacion'
    ).length,

    resueltos: this.reportes().filter(
      reporte => reporte.estado === 'resuelto'
    ).length,
  }));

  readonly reportesFiltrados = computed(() => {
    const texto = this.normalizar(this.busqueda());
    const estado = this.filtroEstado();

    return this.reportes().filter(reporte => {
      const contenido = this.normalizar([
        reporte.folio,
        reporte.equipo.etiqueta,
        reporte.equipo.tipo,
        reporte.equipo.marca,
        reporte.equipo.modelo,
        reporte.equipo.ubicacion,
        reporte.equipo.area ?? '',
        reporte.reportadoPor,
        reporte.descripcion,
        reporte.diagnostico,
        reporte.solucion,
      ].join(' '));

      return (
        (!estado || reporte.estado === estado) &&
        contenido.includes(texto)
      );
    });
  });

  get equiposDisponibles(): EquipoDelReporte[] {
    const abiertos = new Set(
      this.reportes()
        .filter(reporte => reporte.estado !== 'resuelto')
        .map(reporte => reporte.equipo.id)
    );

    const texto = this.normalizar(this.busquedaEquipo);

    return this.equipos().filter(equipo => {
      const coincide = this.normalizar([
        equipo.etiqueta,
        equipo.tipo,
        equipo.marca,
        equipo.modelo,
        equipo.serie ?? '',
      ].join(' ')).includes(texto);

      return (
        equipo.id !== undefined &&
        equipo.estado !== 'desechado' &&
        !abiertos.has(equipo.id) &&
        (coincide || equipo.id === this.nuevo.equipoId)
      );
    });
  }

  get equipoElegido(): EquipoDelReporte | undefined {
    return this.equipos().find(
      equipo => equipo.id === this.nuevo.equipoId
    );
  }

  get estadosPermitidos(): {
    valor: EstadoReporte;
    nombre: string;
  }[] {
    const reporte = this.seleccionado();

    if (!reporte) return [];

    const permitidos: Record<EstadoReporte, EstadoReporte[]> = {
      pendiente: ['pendiente', 'revision'],
      revision: ['revision', 'reparacion', 'resuelto'],
      reparacion: ['reparacion', 'resuelto'],
      resuelto: ['resuelto'],
    };

    return this.estados.filter(
      estado => permitidos[reporte.estado].includes(estado.valor)
    );
  }

  constructor() {
    afterNextRender(() => {
      void this.cargarDatos();
    });
  }

  async cargarDatos(): Promise<void> {
    if (this.guardando()) return;

    this.cargando.set(true);
    this.conexionLista.set(false);
    this.error.set('');

    try {
      const [equipos, reportes] = await Promise.all([
        firstValueFrom(this.equipoService.listarEquipos()),
        firstValueFrom(this.reporteService.listar()),
      ]);

      this.equipos.set(equipos);
      this.reportes.set(reportes);
      this.conexionLista.set(true);
      this.seleccionado.set(null);
    } catch (error) {
      this.error.set(this.mensajeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  abrirNuevo(): void {
    if (!this.puedeGuardar()) return;

    this.nuevo = this.formularioVacio();
    this.busquedaEquipo = '';
    this.seleccionado.set(null);
    this.error.set('');
    this.mensaje.set('');
    this.mostrarFormulario = true;
  }

  cancelarNuevo(): void {
    if (this.guardando()) return;

    this.mostrarFormulario = false;
  }

  async guardarNuevo(): Promise<void> {
    if (!this.puedeGuardar()) return;

    const equipoId = this.nuevo.equipoId;
    const reportadoPor = this.nuevo.reportadoPor.trim();
    const descripcion = this.nuevo.descripcion.trim();

    if (equipoId === null || !reportadoPor || !descripcion) {
      this.error.set(
        'Selecciona el equipo y completa quién reporta y la falla.'
      );
      return;
    }

    this.guardando.set(true);
    this.error.set('');
    this.mensaje.set('');

    try {
      const reporte = await firstValueFrom(
        this.reporteService.crear({
          equipoId,
          reportadoPor,
          descripcion,
          prioridad: this.nuevo.prioridad,
        })
      );

      this.reportes.update(reportes => [
        reporte,
        ...reportes,
      ]);

      this.mostrarFormulario = false;
      this.limpiarFiltros();
      this.abrirDetalle(reporte);

      this.mensaje.set(
        `Reporte ${reporte.folio} registrado.`
      );
    } catch (error) {
      this.error.set(this.mensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  abrirDetalle(reporte: ReporteFalla): void {
    this.seleccionado.set(reporte);
    this.mostrarFormulario = false;

    this.seguimiento = {
      estado: reporte.estado,
      diagnostico: reporte.diagnostico ?? '',
      solucion: reporte.solucion ?? '',
    };
  }

  cerrarDetalle(): void {
    if (this.guardando()) return;

    this.seleccionado.set(null);
  }

  async guardarSeguimiento(): Promise<void> {
    if (!this.puedeGuardar()) return;

    const reporte = this.seleccionado();

    if (!reporte || reporte.estado === 'resuelto') return;

    const datos: SeguimientoReporte = {
      estado: this.seguimiento.estado,
      diagnostico: this.seguimiento.diagnostico.trim(),
      solucion: this.seguimiento.solucion.trim(),
    };

    if (
      ['reparacion', 'resuelto'].includes(datos.estado) &&
      !datos.diagnostico
    ) {
      this.error.set('Captura el diagnóstico.');
      return;
    }

    if (datos.estado === 'resuelto' && !datos.solucion) {
      this.error.set(
        'Describe la solución para resolver el reporte.'
      );
      return;
    }

    this.guardando.set(true);
    this.error.set('');
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

      this.equipos.update(equipos =>
        equipos.map(equipo =>
          equipo.id === actualizado.equipo.id
            ? actualizado.equipo
            : equipo
        )
      );

      this.abrirDetalle(actualizado);

      this.mensaje.set(
        `Seguimiento de ${actualizado.folio} actualizado.`
      );
    } catch (error) {
      this.error.set(this.mensajeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroEstado.set('');
  }

  nombreEstado(estado: string): string {
    return this.estados.find(
      item => item.valor === estado
    )?.nombre ?? estado;
  }

  nombrePrioridad(prioridad: string): string {
    return this.prioridades.find(
      item => item.valor === prioridad
    )?.nombre ?? prioridad;
  }

  fecha(valor: string | null): string {
    if (!valor) return '—';

    const fecha = new Date(valor);

    return Number.isNaN(fecha.getTime())
      ? '—'
      : fecha.toLocaleString('es-MX');
  }

  exportarExcel(): void {
    if (
      this.cargando() ||
      !this.conexionLista() ||
      !this.reportesFiltrados().length
    ) {
      return;
    }

    try {
      const hoja = XLSX.utils.aoa_to_sheet([
        [
          'Folio',
          'Etiqueta',
          'Tipo',
          'Reporta',
          'Falla',
          'Prioridad',
          'Estado del reporte',
          'Diagnóstico',
          'Solución',
          'Fecha de reporte',
          'Fecha de resolución',
        ],
        ...this.reportesFiltrados().map(reporte => [
          reporte.folio,
          reporte.equipo.etiqueta,
          reporte.equipo.tipo,
          reporte.reportadoPor,
          reporte.descripcion,
          this.nombrePrioridad(reporte.prioridad),
          this.nombreEstado(reporte.estado),
          reporte.diagnostico,
          reporte.solucion,
          this.fecha(reporte.fechaReporte),
          this.fecha(reporte.fechaResolucion),
        ]),
      ]);

      hoja['!cols'] = [
        { wch: 18 },
        { wch: 22 },
        { wch: 18 },
        { wch: 30 },
        { wch: 55 },
        { wch: 15 },
        { wch: 22 },
        { wch: 55 },
        { wch: 55 },
        { wch: 25 },
        { wch: 25 },
      ];

      const libro = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        libro,
        hoja,
        'Reportes de fallas'
      );

      XLSX.writeFile(libro, 'reportes-de-fallas.xlsx');
    } catch {
      this.error.set(
        'No fue posible generar el archivo Excel.'
      );
    }
  }

  private puedeGuardar(): boolean {
    return (
      !this.cargando() &&
      !this.guardando() &&
      this.conexionLista()
    );
  }

  private formularioVacio(): {
    equipoId: number | null;
    reportadoPor: string;
    descripcion: string;
    prioridad: PrioridadReporte;
  } {
    return {
      equipoId: null,
      reportadoPor: '',
      descripcion: '',
      prioridad: 'media',
    };
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'No se pudo conectar con el backend.';
      }

      if (typeof error.error?.mensaje === 'string') {
        return error.error.mensaje;
      }

      if (error.status === 404) {
        return (
          'No se encontró el recurso. Comprueba que reiniciaste ' +
          'el backend con el nuevo controlador.'
        );
      }
    }

    return (
      'No fue posible completar la operación. ' +
      'Revisa la consola del backend.'
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
