import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';

import { EquipoService } from '../../Services/equipo.service';

type EstadoEquipo =
  | 'disponible'
  | 'activo'
  | 'nuevo'
  | 'danado'
  | 'reparacion'
  | 'reparado'
  | 'desechado';

interface Equipo {
  id?: number;
  etiqueta: string;
  tipo: string;
  marca: string;
  modelo: string;
  serie: string;
  usuario: string;
  ubicacion: string;
  area?: string;
  observaciones?: string;
  estado: EstadoEquipo;
  fechaRegistro: string;
}

interface ReferenciaCatalogo {
  tipo: string;
  marca: string;
  modelo: string;
}

interface FilaImportacion {
  fila: number;
  equipo: Equipo;
  errores: string[];
}

@Component({
  selector: 'app-equipos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './equipos.html',
  styleUrl: './equipos.css',
})
export class Equipos {
  private readonly route = inject(ActivatedRoute);
  private readonly equipoService = inject(EquipoService);
  private readonly claveCatalogo = 'inventario-catalogo';

  readonly equipos = signal<Equipo[]>([]);
  readonly catalogo = signal<ReferenciaCatalogo[]>([]);
  readonly vistaPrevia = signal<FilaImportacion[]>([]);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly importando = signal(false);
  readonly conexionLista = signal(false);

  readonly areasDisponibles: string[] = [
    'Contabilidad Gubernamental',
    'Comercial',
    'Servicios Jurídicos',
    'Recursos Humanos, Tecnológicos y Materiales',
    'Contraloría Interna',
    'Control Financiero',
    'Operaciones',
    'Contabilidad Interna',
    'Investigación',
  ];

  readonly tipos = [
    'CPU',
    'Laptop',
    'Monitor',
    'Teclado',
    'Mouse',
    'Proyector',
    'Impresora',
    'Regulador',
    'No break',
    'Switch',
    'Router',
    'Otro',
  ];

  readonly estados: {
    valor: EstadoEquipo;
    nombre: string;
  }[] = [
    { valor: 'disponible', nombre: 'Disponible' },
    { valor: 'activo', nombre: 'Asignado / activo' },
    { valor: 'nuevo', nombre: 'Nuevo' },
    { valor: 'danado', nombre: 'Dañado' },
    { valor: 'reparacion', nombre: 'En reparación' },
    { valor: 'reparado', nombre: 'Reparado' },
    { valor: 'desechado', nombre: 'Dado de baja' },
  ];

  readonly campos: {
    clave: keyof Equipo;
    etiqueta: string;
  }[] = [
    { clave: 'etiqueta', etiqueta: 'Etiqueta' },
    { clave: 'tipo', etiqueta: 'Tipo' },
    { clave: 'marca', etiqueta: 'Marca' },
    { clave: 'modelo', etiqueta: 'Modelo' },
    { clave: 'serie', etiqueta: 'Serie' },
    { clave: 'usuario', etiqueta: 'Usuario' },
    { clave: 'ubicacion', etiqueta: 'Ubicación' },
    { clave: 'area', etiqueta: 'Área' },
    { clave: 'estado', etiqueta: 'Estado' },
    { clave: 'observaciones', etiqueta: 'Observaciones' },
  ];

  readonly resumen = computed(() => ({
    total: this.equipos().length,
    activos: this.equipos().filter(e => e.estado === 'activo').length,
    disponibles: this.equipos().filter(
      e => e.estado === 'disponible'
    ).length,
    reparacion: this.equipos().filter(
      e => e.estado === 'reparacion'
    ).length,
  }));

  readonly filasValidas = computed(() =>
    this.vistaPrevia().filter(fila => fila.errores.length === 0)
  );

  mostrarFormulario = false;
  mostrarNuevaMarca = false;
  mostrarNuevoModelo = false;

  equipoEnEdicion: Equipo | null = null;
  equipoPendienteEliminar: Equipo | null = null;

  nuevaMarca = '';
  nuevoModelo = '';
  errorCatalogo = '';
  avisoCatalogo = '';

  busqueda = '';
  filtroEstado = '';
  filtroArea = '';

  error = '';
  mensaje = '';
  nombreArchivo = '';

  nuevoEquipo: Equipo = this.crearEquipoVacio();

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(params => {
        const estado = params.get('estado') ?? '';

        this.filtroEstado = this.estados.some(
          item => item.valor === estado
        ) ? estado : '';

        const area = params.get('area') ?? '';

        this.filtroArea = area === '__sin_area__'
          ? area
          : this.areasDisponibles.find(
          item => this.normalizar(item) === this.normalizar(area)
        ) ?? '';

        if (params.get('accion') === 'agregar') {
          this.abrirFormulario();
        }
      });

    afterNextRender(() => {
      this.cargarCatalogo();
      void this.cargarEquipos();
    });
  }

  get equiposFiltrados(): Equipo[] {
    const texto = this.normalizar(this.busqueda);
    const areaSeleccionada = this.normalizar(this.filtroArea);

    return this.equipos().filter(equipo => {
      const coincideEstado =
        !this.filtroEstado || equipo.estado === this.filtroEstado;

      const areaEquipo = this.normalizar(equipo.area ?? '');

      const coincideArea =
        !areaSeleccionada ||
        (areaSeleccionada === '__sin_area__'
          ? !areaEquipo
          : areaEquipo === areaSeleccionada);

      const contenido = this.normalizar([
        equipo.etiqueta,
        equipo.tipo,
        equipo.marca,
        equipo.modelo,
        equipo.serie,
        equipo.usuario,
        equipo.ubicacion,
        equipo.area ?? '',
        equipo.observaciones ?? '',
        this.nombreEstado(equipo.estado),
      ].join(' '));

      return coincideEstado && coincideArea && contenido.includes(texto);
    });
  }

  get marcasDisponibles(): string[] {
    return this.valoresUnicos([
      ...this.catalogo().map(item => item.marca),
      ...this.equipos().map(equipo => equipo.marca),
    ]);
  }

  get modelosPorMarca(): string[] {
    const tipo = this.normalizar(this.nuevoEquipo.tipo);
    const marca = this.normalizar(this.nuevoEquipo.marca);

    if (!tipo || !marca) return [];

    return this.valoresUnicos([
      ...this.catalogo()
        .filter(item =>
          this.normalizar(item.tipo) === tipo &&
          this.normalizar(item.marca) === marca
        )
        .map(item => item.modelo),

      ...this.equipos()
        .filter(equipo =>
          this.normalizar(equipo.tipo) === tipo &&
          this.normalizar(equipo.marca) === marca
        )
        .map(equipo => equipo.modelo),
    ]);
  }

  get areaActualFueraDeCatalogo(): boolean {
    const area = this.normalizar(this.nuevoEquipo.area ?? '');

    return !!area && !this.areasDisponibles.some(
      item => this.normalizar(item) === area
    );
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = '';
    this.filtroArea = '';
  }

  abrirFormulario(): void {
    if (this.guardando() || this.importando()) return;

    this.cancelarCatalogo();
    this.equipoEnEdicion = null;
    this.equipoPendienteEliminar = null;
    this.nuevoEquipo = this.crearEquipoVacio();
    this.error = '';
    this.mensaje = '';
    this.mostrarFormulario = true;
  }

  cancelarFormulario(): void {
    if (this.guardando() || this.importando()) return;
    this.cerrarFormulario();
  }

  private cerrarFormulario(): void {
    this.cancelarCatalogo();
    this.equipoEnEdicion = null;
    this.mostrarFormulario = false;
    this.nuevoEquipo = this.crearEquipoVacio();
    this.error = '';
  }

  editarEquipo(equipo: Equipo): void {
    if (this.guardando() || this.importando()) return;

    this.cancelarCatalogo();
    this.equipoPendienteEliminar = null;
    this.equipoEnEdicion = equipo;
    this.nuevoEquipo = this.limpiarEquipo(equipo);
    this.error = '';
    this.mensaje = '';
    this.mostrarFormulario = true;
  }

  solicitarEliminar(equipo: Equipo): void {
    if (this.guardando() || this.importando()) return;

    this.equipoPendienteEliminar = equipo;
    this.error = '';
    this.mensaje = '';
  }

  cancelarEliminacion(): void {
    if (this.guardando() || this.importando()) return;
    this.equipoPendienteEliminar = null;
  }

  async confirmarEliminacion(): Promise<void> {
    if (!this.puedeModificar()) return;

    const equipo = this.equipoPendienteEliminar;
    if (!equipo) return;

    const id = equipo.id;

    if (id === undefined) {
      this.error = 'El equipo no tiene un ID del servidor.';
      return;
    }

    this.guardando.set(true);
    this.error = '';
    this.mensaje = '';

    try {
      await firstValueFrom(this.equipoService.eliminarEquipo(id));

      this.guardarCatalogo(this.referenciasDeEquipos([equipo]));

      this.equipos.update(equipos =>
        equipos.filter(registrado => registrado.id !== id)
      );

      if (this.equipoEnEdicion?.id === id) {
        this.cerrarFormulario();
      }

      this.equipoPendienteEliminar = null;
      this.mensaje =
        `Se eliminó ${equipo.tipo} con etiqueta ${equipo.etiqueta}.`;

      this.revalidarImportacion();
    } catch (error) {
      this.error = this.mensajeError(
        error,
        'No fue posible eliminar el equipo.'
      );
    } finally {
      this.guardando.set(false);
    }
  }

  cambiarTipo(tipo: string): void {
    this.cancelarCatalogo();
    this.nuevoEquipo.tipo = tipo;
    this.nuevoEquipo.marca = '';
    this.nuevoEquipo.modelo = '';

    const referencias = [
      ...this.catalogo(),
      ...this.equipos(),
    ].filter(item =>
      this.normalizar(item.tipo) === this.normalizar(tipo) &&
      item.marca.trim() !== '' &&
      item.modelo.trim() !== ''
    );

    const combinaciones = new Map<string, ReferenciaCatalogo>();

    for (const referencia of referencias) {
      const clave = JSON.stringify([
        this.normalizar(referencia.marca),
        this.normalizar(referencia.modelo),
      ]);

      if (!combinaciones.has(clave)) {
        combinaciones.set(clave, referencia);
      }
    }

    if (combinaciones.size === 1) {
      const referencia = [...combinaciones.values()][0];

      this.nuevoEquipo.marca = this.textoCatalogo(
        referencia.marca,
        this.marcasDisponibles
      );

      this.nuevoEquipo.modelo = this.textoCatalogo(
        referencia.modelo,
        this.modelosPorMarca
      );
    }
  }

  seleccionarMarca(valor: string): void {
    if (valor === '__agregar_marca__') {
      this.cancelarCatalogo();
      this.mostrarNuevaMarca = true;
      return;
    }

    this.cambiarMarca(valor);
  }

  seleccionarModelo(valor: string): void {
    if (valor === '__agregar_modelo__') {
      this.cancelarCatalogo();

      if (!this.nuevoEquipo.tipo || !this.nuevoEquipo.marca) {
        this.errorCatalogo = 'Selecciona primero el tipo y la marca.';
        return;
      }

      this.mostrarNuevoModelo = true;
      return;
    }

    this.cancelarCatalogo();
    this.nuevoEquipo.modelo = valor;
  }

  cambiarMarca(marca: string): void {
    this.cancelarCatalogo();
    this.nuevoEquipo.marca = marca;
    this.nuevoEquipo.modelo = '';

    const modelos = this.modelosPorMarca;

    if (modelos.length === 1) {
      this.nuevoEquipo.modelo = modelos[0];
    }
  }

  cancelarCatalogo(): void {
    this.mostrarNuevaMarca = false;
    this.mostrarNuevoModelo = false;
    this.nuevaMarca = '';
    this.nuevoModelo = '';
    this.errorCatalogo = '';
  }

  guardarMarca(): void {
    this.errorCatalogo = '';
    const marca = this.primeraMayuscula(this.nuevaMarca);

    if (!marca || marca.length > 100) {
      this.errorCatalogo = 'Escribe una marca de hasta 100 caracteres.';
      return;
    }

    if (this.marcasDisponibles.some(
      valor => this.normalizar(valor) === this.normalizar(marca)
    )) {
      this.errorCatalogo = 'La marca ya existe; selecciónala en la lista.';
      return;
    }

    this.guardarCatalogo([
      ...this.catalogo(),
      { tipo: '', marca, modelo: '' },
    ]);

    this.cambiarMarca(marca);
  }

  guardarModelo(): void {
    this.errorCatalogo = '';

    const tipo = this.nuevoEquipo.tipo;
    const marca = this.nuevoEquipo.marca;
    const modelo = this.primeraMayuscula(this.nuevoModelo);

    if (!tipo || !marca) {
      this.errorCatalogo = 'Selecciona primero el tipo y la marca.';
      return;
    }

    if (!modelo || modelo.length > 150) {
      this.errorCatalogo = 'Escribe un modelo de hasta 150 caracteres.';
      return;
    }

    if (this.modelosPorMarca.some(
      valor => this.normalizar(valor) === this.normalizar(modelo)
    )) {
      this.errorCatalogo =
        'Este modelo ya existe para el tipo y la marca seleccionados.';
      return;
    }

    this.guardarCatalogo([
      ...this.catalogo(),
      { tipo, marca, modelo },
    ]);

    this.nuevoEquipo.modelo = modelo;
    this.cancelarCatalogo();
  }

  primeraMayuscula(valor: string): string {
    const texto = valor.trim();

    return texto
      ? texto.charAt(0).toLocaleUpperCase('es-MX') + texto.slice(1)
      : '';
  }

  async guardarEquipo(): Promise<void> {
    if (!this.puedeModificar()) return;
    if (this.mostrarNuevaMarca || this.mostrarNuevoModelo) return;

    this.error = '';
    this.mensaje = '';

    const original = this.equipoEnEdicion;
    const equipo = this.limpiarEquipo(this.nuevoEquipo);
    const errores = this.validarEquipo(equipo);

    if (original && original.id === undefined) {
      errores.push('El equipo no tiene un ID del servidor.');
    }

    const existe = this.equipos().some(registrado =>
      (!original || registrado.id !== original.id) &&
      this.claveEquipo(registrado) === this.claveEquipo(equipo)
    );

    if (existe) {
      errores.push(
        `Ya existe un ${equipo.tipo} con la etiqueta ${equipo.etiqueta}.`
      );
    }

    if (errores.length) {
      this.error = errores.join(' ');
      return;
    }

    this.guardando.set(true);

    try {
      const guardado: Equipo = original?.id !== undefined
        ? await firstValueFrom(
          this.equipoService.editarEquipo(original.id, equipo)
        )
        : await firstValueFrom(
          this.equipoService.agregarEquipo(equipo)
        );

      this.guardarCatalogo(
        this.referenciasDeEquipos(
          original ? [original, guardado] : [guardado]
        )
      );

      this.equipos.update(equipos =>
        original
          ? equipos.map(registrado =>
            registrado.id === original.id ? guardado : registrado
          )
          : [guardado, ...equipos]
      );

      this.cerrarFormulario();
      this.limpiarFiltros();

      this.mensaje = original
        ? 'Equipo actualizado en el servidor.'
        : 'Equipo registrado en el servidor.';

      this.revalidarImportacion();
    } catch (error) {
      this.error = this.mensajeError(
        error,
        'No fue posible guardar el equipo.'
      );
    } finally {
      this.guardando.set(false);
    }
  }

  nombreEstado(estado: EstadoEquipo): string {
    return this.estados.find(
      item => item.valor === estado
    )?.nombre ?? estado;
  }

  descargarPlantilla(): void {
    const hoja = XLSX.utils.aoa_to_sheet([
      this.campos.map(campo => campo.etiqueta),
    ]);

    hoja['!cols'] = [
      { wch: 22 }, { wch: 16 }, { wch: 18 },
      { wch: 25 }, { wch: 25 }, { wch: 35 },
      { wch: 35 }, { wch: 48 }, { wch: 20 },
      { wch: 50 },
    ];

    const hojaAreas = XLSX.utils.aoa_to_sheet([
      ['Áreas disponibles'],
      ...this.areasDisponibles.map(area => [area]),
    ]);

    hojaAreas['!cols'] = [{ wch: 55 }];

    const libro = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(libro, hoja, 'Equipos');
    XLSX.utils.book_append_sheet(libro, hojaAreas, 'Areas');
    XLSX.writeFile(libro, 'plantilla-inventario.xlsx');
  }

  async seleccionarArchivo(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];

    if (!archivo) return;

    if (this.guardando() || this.importando()) {
      input.value = '';
      return;
    }

    this.error = '';
    this.mensaje = '';
    this.cancelarImportacion();

    if (!/\.(xlsx|xls|csv)$/i.test(archivo.name)) {
      this.error = 'Selecciona un archivo Excel o CSV.';
      input.value = '';
      return;
    }

    if (archivo.size > 10 * 1024 * 1024) {
      this.error = 'El archivo debe pesar como máximo 10 MB.';
      input.value = '';
      return;
    }

    this.importando.set(true);

    try {
      const contenido = /\.csv$/i.test(archivo.name)
        ? await archivo.text()
        : await archivo.arrayBuffer();

      const libro = XLSX.read(contenido, {
        type: typeof contenido === 'string' ? 'string' : 'array',
      });

      const nombreHoja = libro.SheetNames.find(
        nombre => this.normalizar(nombre) === 'equipos'
      ) ?? libro.SheetNames[0];

      if (!nombreHoja) {
        throw new Error('El archivo no contiene hojas.');
      }

      const filas = XLSX.utils.sheet_to_json<unknown[]>(
        libro.Sheets[nombreHoja],
        {
          header: 1,
          defval: '',
          raw: false,
          blankrows: true,
        }
      );

      const indiceCabecera = filas.findIndex(fila =>
        fila.some(celda => this.texto(celda) !== '')
      );

      if (indiceCabecera < 0) {
        throw new Error('El archivo está vacío.');
      }

      const cabecera = filas[indiceCabecera].map(celda =>
        this.normalizar(this.texto(celda))
      );

      const columnas = {
        etiqueta: this.buscarColumna(cabecera, [
          'etiqueta', 'id', 'id equipo',
        ]),
        tipo: this.buscarColumna(cabecera, [
          'tipo', 'tipo de equipo', 'equipo',
        ]),
        marca: this.buscarColumna(cabecera, ['marca']),
        modelo: this.buscarColumna(cabecera, ['modelo']),
        serie: this.buscarColumna(cabecera, [
          'serie', 'numero de serie', 'no serie', 'serial',
        ]),
        usuario: this.buscarColumna(cabecera, [
          'usuario', 'colaborador', 'nombre colaborador',
          'nombre del colaborador', 'responsable',
        ]),
        ubicacion: this.buscarColumna(cabecera, [
          'ubicacion', 'localizacion',
        ]),
        sede: this.buscarColumna(cabecera, ['sede', 'sucursal']),
        area: this.buscarColumna(cabecera, ['area', 'departamento']),
        estado: this.buscarColumna(cabecera, ['estado', 'estatus']),
        observaciones: this.buscarColumna(cabecera, [
          'observaciones', 'observacion', 'notas', 'comentarios',
        ]),
      };

      const obligatorias = [
        'etiqueta', 'tipo', 'marca', 'modelo',
      ] as const;

      const faltantes: string[] = obligatorias.filter(
        campo => columnas[campo] < 0
      );

      if (columnas.ubicacion < 0 && columnas.sede < 0) {
        faltantes.push('ubicación o sede');
      }

      if (faltantes.length) {
        throw new Error(
          `Faltan columnas: ${faltantes.join(', ')}. ` +
          'Usa la plantilla como referencia.'
        );
      }

      const pendientes: FilaImportacion[] = [];
      const referencias: ReferenciaCatalogo[] = [
        ...this.catalogo(),
        ...this.equipos(),
      ];

      for (let i = indiceCabecera + 1; i < filas.length; i++) {
        const fila = filas[i];

        if (!fila.some(celda => this.texto(celda) !== '')) continue;

        if (pendientes.length >= 5000) {
          throw new Error('Importa como máximo 5,000 equipos por archivo.');
        }

        const leer = (indice: number): string =>
          indice >= 0 ? this.texto(fila[indice]) : '';

        const estadoOriginal = leer(columnas.estado);
        const estado = this.interpretarEstado(estadoOriginal);

        const equipo = this.limpiarEquipo({
          etiqueta: leer(columnas.etiqueta),
          tipo: leer(columnas.tipo),
          marca: leer(columnas.marca),
          modelo: leer(columnas.modelo),
          serie: leer(columnas.serie),
          usuario: leer(columnas.usuario),
          ubicacion: leer(columnas.ubicacion) || leer(columnas.sede),
          area: leer(columnas.area),
          observaciones: leer(columnas.observaciones),
          estado: estado ?? 'nuevo',
          fechaRegistro: '',
        }, referencias);

        referencias.push(equipo);

        pendientes.push({
          fila: i + 1,
          equipo,
          errores: estado === null
            ? [`Estado desconocido: "${estadoOriginal}".`]
            : [],
        });
      }

      if (!pendientes.length) {
        throw new Error('No hay equipos debajo de los encabezados.');
      }

      this.nombreArchivo = `${archivo.name} · Hoja: ${nombreHoja}`;
      this.vistaPrevia.set(this.validarFilas(pendientes));
    } catch (error) {
      this.error = error instanceof Error
        ? error.message
        : 'No fue posible leer el archivo.';
    } finally {
      this.importando.set(false);
      input.value = '';
    }
  }

  async confirmarImportacion(): Promise<void> {
    if (!this.puedeModificar()) return;

    this.error = '';
    this.mensaje = '';
    this.importando.set(true);

    try {
      const actuales = await firstValueFrom(
        this.equipoService.listarEquipos()
      );

      this.equipos.set(actuales);

      const revisadas = this.validarFilas(this.vistaPrevia());
      this.vistaPrevia.set(revisadas);

      const validas = revisadas.filter(fila => !fila.errores.length);

      if (!validas.length) {
        this.error = 'No hay filas válidas para importar.';
        return;
      }

      const pendientes = revisadas.filter(fila => fila.errores.length);
      const guardados: Equipo[] = [];

      for (let i = 0; i < validas.length; i++) {
        const fila = validas[i];

        try {
          const guardado = await firstValueFrom(
            this.equipoService.agregarEquipo(fila.equipo)
          );

          guardados.push(guardado);
          this.equipos.update(equipos => [guardado, ...equipos]);
        } catch (error) {
          pendientes.push({
            ...fila,
            errores: [
              'Servidor: ' + this.mensajeError(
                error,
                'No fue posible guardar esta fila.'
              ),
            ],
          });

          if (error instanceof HttpErrorResponse && error.status === 0) {
            pendientes.push(...validas.slice(i + 1).map(restante => ({
              ...restante,
              errores: [
                'Servidor: No se intentó guardar por pérdida de conexión.',
              ],
            })));
            break;
          }
        }
      }

      if (guardados.length) {
        this.guardarCatalogo(this.referenciasDeEquipos(guardados));
      }

      this.vistaPrevia.set(
        pendientes.sort((a, b) => a.fila - b.fila)
      );

      this.limpiarFiltros();

      this.mensaje =
        `Se guardaron ${guardados.length} equipos en el servidor.` +
        (pendientes.length
          ? ` Quedan ${pendientes.length} filas pendientes.`
          : '');

      if (!pendientes.length) this.nombreArchivo = '';
    } catch (error) {
      this.error = this.mensajeError(
        error,
        'No fue posible comprobar el inventario antes de importar.'
      );
    } finally {
      this.importando.set(false);
    }
  }

  cancelarImportacion(): void {
    if (this.importando()) return;
    this.vistaPrevia.set([]);
    this.nombreArchivo = '';
  }

  private revalidarImportacion(): void {
    if (this.vistaPrevia().length) {
      this.vistaPrevia.set(
        this.validarFilas(this.vistaPrevia(), true)
      );
    }
  }

  private validarFilas(
    filas: FilaImportacion[],
    conservarErroresServidor = false
  ): FilaImportacion[] {
    const existentes = new Set(
      this.equipos().map(equipo => this.claveEquipo(equipo))
    );

    const dentroArchivo = new Set<string>();

    return filas.map(fila => {
      const errores = [
        ...fila.errores.filter(error =>
          error.startsWith('Estado desconocido:') ||
          (
            conservarErroresServidor &&
            error.startsWith('Servidor:')
          )
        ),
        ...this.validarEquipo(fila.equipo),
      ];

      const clave = this.claveEquipo(fila.equipo);

      if (existentes.has(clave)) {
        errores.push('La etiqueta y el tipo ya existen en el inventario.');
      }

      if (dentroArchivo.has(clave)) {
        errores.push('La etiqueta y el tipo se repiten en este archivo.');
      }

      if (!errores.length) dentroArchivo.add(clave);

      return { ...fila, errores };
    });
  }

  private validarEquipo(equipo: Equipo): string[] {
    const errores: string[] = [];

    for (const campo of [
      'etiqueta', 'tipo', 'marca', 'modelo', 'ubicacion',
    ] as const) {
      if (!equipo[campo].trim()) errores.push(`Falta ${campo}.`);
    }

    const limites: {
      campo: keyof Equipo;
      nombre: string;
      maximo: number;
    }[] = [
      { campo: 'etiqueta', nombre: 'Etiqueta', maximo: 80 },
      { campo: 'marca', nombre: 'Marca', maximo: 100 },
      { campo: 'modelo', nombre: 'Modelo', maximo: 150 },
      { campo: 'serie', nombre: 'Serie', maximo: 150 },
      { campo: 'usuario', nombre: 'Usuario', maximo: 200 },
      { campo: 'ubicacion', nombre: 'Ubicación', maximo: 200 },
      { campo: 'area', nombre: 'Área', maximo: 200 },
      { campo: 'observaciones', nombre: 'Observaciones', maximo: 2000 },
    ];

    for (const limite of limites) {
      if (String(equipo[limite.campo] ?? '').length > limite.maximo) {
        errores.push(
          `${limite.nombre} admite hasta ${limite.maximo} caracteres.`
        );
      }
    }

    if (!this.tipos.includes(equipo.tipo)) {
      errores.push('Tipo de equipo no reconocido.');
    }

    if (!this.estados.some(item => item.valor === equipo.estado)) {
      errores.push('Estado no válido.');
    }

    if (equipo.estado === 'activo' && !equipo.usuario.trim()) {
      errores.push('Los equipos asignados requieren un usuario.');
    }

    const area = this.normalizar(equipo.area ?? '');

    if (
      area &&
      !this.areasDisponibles.some(item => this.normalizar(item) === area)
    ) {
      errores.push('Selecciona una de las áreas del catálogo.');
    }

    return errores;
  }

  private limpiarEquipo(
    equipo: Equipo,
    referencias: ReferenciaCatalogo[] = [
      ...this.catalogo(),
      ...this.equipos(),
    ]
  ): Equipo {
    const tipo = this.tipos.find(candidato =>
      this.normalizar(candidato) === this.normalizar(equipo.tipo)
    ) ?? this.primeraMayuscula(equipo.tipo);

    const marca = this.textoCatalogo(
      equipo.marca,
      referencias.map(item => item.marca)
    );

    const modelos = referencias
      .filter(item =>
        this.normalizar(item.tipo) === this.normalizar(tipo) &&
        this.normalizar(item.marca) === this.normalizar(marca)
      )
      .map(item => item.modelo);

    const areaRecibida = (equipo.area ?? '').trim();

    const area = this.areasDisponibles.find(item =>
      this.normalizar(item) === this.normalizar(areaRecibida)
    ) ?? areaRecibida;

    return {
      id: equipo.id,
      etiqueta: equipo.etiqueta.trim().toUpperCase(),
      tipo,
      marca,
      modelo: this.textoCatalogo(equipo.modelo, modelos),
      serie: (equipo.serie ?? '').trim(),
      usuario: this.primeraMayuscula(equipo.usuario ?? ''),
      ubicacion: this.primeraMayuscula(equipo.ubicacion ?? ''),
      area,
      observaciones: this.primeraMayuscula(equipo.observaciones ?? ''),
      estado: equipo.estado,
      fechaRegistro: equipo.fechaRegistro,
    };
  }

  private valoresUnicos(valores: string[]): string[] {
    const unicos = new Map<string, string>();

    for (const valor of valores) {
      const texto = this.primeraMayuscula(valor);
      const clave = this.normalizar(texto);

      if (clave && !unicos.has(clave)) unicos.set(clave, texto);
    }

    return [...unicos.values()].sort(
      (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
  }

  private textoCatalogo(valor: string, existentes: string[]): string {
    const registrado = existentes.find(existente =>
      this.normalizar(existente) === this.normalizar(valor)
    );

    return this.primeraMayuscula(registrado ?? valor);
  }

  private claveEquipo(equipo: Equipo): string {
    return JSON.stringify([
      equipo.etiqueta.trim().toUpperCase(),
      this.normalizar(equipo.tipo),
    ]);
  }

  private interpretarEstado(texto: string): EstadoEquipo | null {
    const estados: Record<string, EstadoEquipo> = {
      disponible: 'disponible',
      disponibles: 'disponible',
      activo: 'activo',
      activos: 'activo',
      asignado: 'activo',
      asignados: 'activo',
      'asignado / activo': 'activo',
      nuevo: 'nuevo',
      nuevos: 'nuevo',
      danado: 'danado',
      danados: 'danado',
      reparacion: 'reparacion',
      'en reparacion': 'reparacion',
      reparado: 'reparado',
      reparados: 'reparado',
      desechado: 'desechado',
      desechados: 'desechado',
      baja: 'desechado',
      'dado de baja': 'desechado',
    };

    const valor = this.normalizar(texto);
    return valor ? estados[valor] ?? null : 'nuevo';
  }

  private buscarColumna(cabecera: string[], nombres: string[]): number {
    return cabecera.findIndex(nombre => nombres.includes(nombre));
  }

  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  private texto(valor: unknown): string {
    return valor === undefined || valor === null
      ? ''
      : String(valor).trim();
  }

  private referenciasDeEquipos(equipos: Equipo[]): ReferenciaCatalogo[] {
    const referencias = [...this.catalogo()];

    const claves = new Set(
      referencias.map(item => JSON.stringify([
        this.normalizar(item.tipo),
        this.normalizar(item.marca),
        this.normalizar(item.modelo),
      ]))
    );

    for (const equipo of equipos) {
      const referencia: ReferenciaCatalogo = {
        tipo: equipo.tipo,
        marca: this.primeraMayuscula(equipo.marca),
        modelo: this.primeraMayuscula(equipo.modelo),
      };

      const clave = JSON.stringify([
        this.normalizar(referencia.tipo),
        this.normalizar(referencia.marca),
        this.normalizar(referencia.modelo),
      ]);

      if (!claves.has(clave)) {
        claves.add(clave);
        referencias.push(referencia);
      }
    }

    return referencias;
  }

  private guardarCatalogo(referencias: ReferenciaCatalogo[]): void {
    this.catalogo.set(referencias);
    this.avisoCatalogo = '';

    try {
      localStorage.setItem(
        this.claveCatalogo,
        JSON.stringify(referencias)
      );
    } catch {
      this.avisoCatalogo =
        'El catálogo está disponible en esta sesión, pero no pudo ' +
        'guardarse en el navegador.';
    }
  }

  private cargarCatalogo(): void {
    try {
      const guardado = localStorage.getItem(this.claveCatalogo);
      if (!guardado) return;

      const datos: unknown = JSON.parse(guardado);

      if (
        !Array.isArray(datos) ||
        !datos.every(dato => this.esReferencia(dato))
      ) {
        this.avisoCatalogo =
          'El catálogo guardado tiene un formato inválido.';
        return;
      }

      this.catalogo.set(datos);
    } catch {
      this.avisoCatalogo = 'No fue posible leer el catálogo guardado.';
    }
  }

  async cargarEquipos(): Promise<void> {
    if (this.guardando() || this.importando()) return;

    this.cargando.set(true);
    this.conexionLista.set(false);
    this.error = '';

    try {
      const equipos = await firstValueFrom(
        this.equipoService.listarEquipos()
      );

      this.equipos.set(equipos);
      this.conexionLista.set(true);

      if (equipos.length) {
        this.guardarCatalogo(this.referenciasDeEquipos(equipos));
      }

      this.revalidarImportacion();
    } catch (error) {
      this.error = this.mensajeError(
        error,
        'No fue posible consultar los equipos del servidor.'
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private puedeModificar(): boolean {
    if (this.guardando() || this.importando()) return false;

    if (this.cargando()) {
      this.error = 'Espera a que termine de cargar el inventario.';
      return false;
    }

    if (!this.conexionLista()) {
      this.error =
        'No se ha conectado con el backend. ' +
        'Comprueba que esté ejecutándose y pulsa Actualizar.';
      return false;
    }

    return true;
  }

  private mensajeError(error: unknown, alternativa: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return (
          'No se pudo comunicar con el backend. ' +
          'Comprueba que esté ejecutándose y permita el acceso del frontend.'
        );
      }

      const cuerpo: unknown = error.error;

      if (cuerpo && typeof cuerpo === 'object') {
        const mensaje = (cuerpo as Record<string, unknown>)['mensaje'];

        if (typeof mensaje === 'string' && mensaje.trim()) {
          return mensaje;
        }
      }

      if (error.status === 409) {
        return 'Conflicto al guardar: revisa los datos y la etiqueta.';
      }

      if (error.status === 404) {
        return 'El registro o la dirección solicitada no existe.';
      }
    }

    return alternativa;
  }

  private crearEquipoVacio(): Equipo {
    return {
      etiqueta: '',
      tipo: '',
      marca: '',
      modelo: '',
      serie: '',
      usuario: '',
      ubicacion: '',
      area: '',
      observaciones: '',
      estado: 'nuevo',
      fechaRegistro: '',
    };
  }

  private esReferencia(valor: unknown): valor is ReferenciaCatalogo {
    if (!valor || typeof valor !== 'object') return false;

    const item = valor as Record<string, unknown>;

    return ['tipo', 'marca', 'modelo'].every(
      campo => typeof item[campo] === 'string'
    );
  }
}
