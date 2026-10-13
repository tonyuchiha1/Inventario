import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type EstadoReporte =
  | 'pendiente'
  | 'revision'
  | 'reparacion'
  | 'resuelto';

export type PrioridadReporte = 'baja' | 'media' | 'alta';

export interface EquipoDelReporte {
  id?: number;
  etiqueta: string;
  tipo: string;
  marca: string;
  modelo: string;
  estado: string;
  ubicacion: string;
  area?: string | null;
  serie?: string | null;
}

export interface ReporteFalla {
  id: number;
  folio: string;
  equipo: EquipoDelReporte;
  reportadoPor: string;
  descripcion: string;
  prioridad: PrioridadReporte;
  estado: EstadoReporte;
  diagnostico: string;
  solucion: string;
  fechaReporte: string;
  fechaActualizacion: string;
  fechaResolucion: string | null;
}

export interface NuevoReporte {
  equipoId: number;
  reportadoPor: string;
  descripcion: string;
  prioridad: PrioridadReporte;
}

export interface SeguimientoReporte {
  estado: EstadoReporte;
  diagnostico: string;
  solucion: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReporteFallaService {
  private readonly http = inject(HttpClient);

  private readonly direccion =
    'http://localhost:8080/api/reportes-fallas';

  listar(): Observable<ReporteFalla[]> {
    return this.http.get<ReporteFalla[]>(this.direccion);
  }

  crear(datos: NuevoReporte): Observable<ReporteFalla> {
    return this.http.post<ReporteFalla>(
      this.direccion,
      datos
    );
  }

  actualizar(
    id: number,
    datos: SeguimientoReporte
  ): Observable<ReporteFalla> {
    return this.http.put<ReporteFalla>(
      `${this.direccion}/${id}/seguimiento`,
      datos
    );
  }
}
