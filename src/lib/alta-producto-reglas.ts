/**
 * Lo que entra al alta de un producto (docs/sdd/014, spec 002) y su validación. Puro: lo usan la
 * pantalla (para avisar antes de mandar) y el servidor (que no confía en la pantalla).
 */

/** El modelo de una pieza: un archivo de la biblioteca y, si el 3MF tiene varias, la placa. */
export interface ModeloDeAlta {
  archivoId: string;
  placa: number | null;
}

/** La receta de una pieza, como la guarda Bodega. */
export interface RecetaDeAlta {
  gramos: number | null;
  segundos: number | null;
  materialId: string | null;
  /** Lo que se le agrega por unidad (imanes, cadena), en pesos. */
  insumos: number | null;
}

export interface OpcionDeAlta {
  nombre: string;
  modelo: ModeloDeAlta | null;
  /** Lo que difiere del producto (los gramos de su placa, por ejemplo). */
  receta?: Partial<RecetaDeAlta>;
}

export interface EntradaAlta {
  nombre: string;
  serie?: string | null;
  /** false = no se fabrica (kit, repuesto, reventa): sin piezas de Bodega. */
  fabrica: boolean;
  receta: RecetaDeAlta;
  /** El modelo del producto cuando no tiene grupo de piezas. */
  modelo: ModeloDeAlta | null;
  variantes: { grupo: string; opciones: OpcionDeAlta[] } | null;
  funda: {
    grupo: string;
    /** Un insumo que ya existe. */
    insumoStockId: string | null;
    /** O uno nuevo, con su modelo. */
    nuevo: { nombre: string; modelo: ModeloDeAlta | null; receta: RecetaDeAlta } | null;
  } | null;
}

const limpio = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const positivoONulo = (n: number | null | undefined) => n == null || (Number.isFinite(n) && n >= 0);

function recetaInvalida(r: Partial<RecetaDeAlta> | undefined, que: string): string | null {
  if (!r) return null;
  if (!positivoONulo(r.gramos)) return `${que}: los gramos tienen que ser un número positivo`;
  if (!positivoONulo(r.segundos)) return `${que}: el tiempo tiene que ser positivo`;
  if (!positivoONulo(r.insumos)) return `${que}: los insumos tienen que ser un monto positivo`;
  return null;
}

function modeloInvalido(m: ModeloDeAlta | null | undefined, que: string): string | null {
  if (!m) return null;
  if (!m.archivoId || typeof m.archivoId !== "string") return `${que}: falta el archivo`;
  if (m.placa != null && (!Number.isInteger(m.placa) || m.placa < 1)) return `${que}: la placa no es válida`;
  return null;
}

/** null si está bien; si no, qué falta, en una frase para mostrar. */
export function validarAlta(e: EntradaAlta): string | null {
  const nombre = limpio(e.nombre);
  if (!nombre) return "Falta el nombre";
  if (nombre.length > 120) return "El nombre es muy largo";
  if (nombre.includes("·")) return 'El nombre no puede tener "·": se usa para separar la opción';
  const r = recetaInvalida(e.receta, "El producto") ?? modeloInvalido(e.modelo, "El producto");
  if (r) return r;

  if (e.variantes) {
    const grupo = limpio(e.variantes.grupo);
    if (!grupo) return "Falta el nombre del grupo de variantes (Color, Diseño…)";
    if (e.variantes.opciones.length === 0) return `"${grupo}" no tiene opciones`;
    if (e.variantes.opciones.length > 60) return `"${grupo}" tiene demasiadas opciones`;
    const vistas = new Set<string>();
    for (const o of e.variantes.opciones) {
      const n = limpio(o.nombre);
      if (!n) return `Hay una opción de "${grupo}" sin nombre`;
      if (n.includes("·")) return `"${n}": el nombre no puede tener "·"`;
      if (vistas.has(n.toLowerCase())) return `La opción "${n}" está repetida`;
      vistas.add(n.toLowerCase());
      const ro = recetaInvalida(o.receta, n) ?? modeloInvalido(o.modelo, n);
      if (ro) return ro;
    }
  }

  if (e.funda) {
    const grupo = limpio(e.funda.grupo);
    if (!grupo) return "Falta el nombre de la funda o el insumo";
    if (e.variantes && limpio(e.variantes.grupo).toLowerCase() === grupo.toLowerCase()) return "La funda y las variantes no pueden llamarse igual";
    if (!e.funda.insumoStockId && !e.funda.nuevo) return `Elegí qué insumo descuenta "Con ${grupo}" o creá uno nuevo`;
    if (e.funda.insumoStockId && e.funda.nuevo) return "Elegí un insumo o creá uno nuevo, no las dos cosas";
    if (e.funda.nuevo) {
      if (!limpio(e.funda.nuevo.nombre)) return "Falta el nombre del insumo nuevo";
      const rn = recetaInvalida(e.funda.nuevo.receta, limpio(e.funda.nuevo.nombre)) ?? modeloInvalido(e.funda.nuevo.modelo, limpio(e.funda.nuevo.nombre));
      if (rn) return rn;
    }
  }
  return null;
}
