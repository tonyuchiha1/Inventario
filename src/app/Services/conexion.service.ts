import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RespuestaConexion {
  base: string;
  usuario: string;
  fecha: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConexionService {
  private readonly http = inject(HttpClient);

  probarConexion(): Observable<RespuestaConexion> {
    return this.http.get<RespuestaConexion>(
      'http://localhost:8080/api/prueba'
    );
  }
}
