import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type EstadoEquipo =
  | 'disponible'
  | 'activo'
  | 'nuevo'
  | 'danado'
  | 'reparacion'
  | 'reparado'
  | 'desechado';

export interface Equipo {
  id?: number;
  etiqueta: string;
  tipo: string;
  marca: string;
  modelo: string;
  serie: string;
  usuario: string;
  ubicacion: string;
  observaciones?: string;
  estado: EstadoEquipo;
  fechaRegistro: string;
}

@Injectable({
  providedIn: 'root'
})
export class EquipoService {
  private readonly http = inject(HttpClient);

  private readonly direccion =
    'http://localhost:8080/api/equipos';

  listarEquipos(): Observable<Equipo[]> {
    return this.http.get<Equipo[]>(this.direccion);
  }

  agregarEquipo(equipo: Equipo): Observable<Equipo> {
    return this.http.post<Equipo>(this.direccion, equipo);
  }

  editarEquipo(id: number, equipo: Equipo): Observable<Equipo> {
    return this.http.put<Equipo>(
      `${this.direccion}/${id}`,
      equipo
    );
  }

  eliminarEquipo(id: number): Observable<void> {
    return this.http.delete<void>(
      `${this.direccion}/${id}`
    );
  }
}
