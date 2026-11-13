/**
 * La lista de Productos (docs/sdd/008): qué se muestra, cómo se filtra, se ordena, se agrupa y se
 * elige. Funciones puras, sin base ni red, para que las use la pantalla y se puedan probar.
 *
 * Lo que se elige no es el producto sino la **variante** (la combinación que se vende): cada una
 * tiene su publicación de ML, su stock y su entrega. Un producto sin variantes activas se elige
 * entero, con la clave `m:<id>`.
 */

/** Una publicación de ML de una variante, según la última lectura de precios. */
export interface PublicacionMl {
  mla: string;
  estado: "active" | "paused" | "otro";
  flex: boolean;
  /** Días de disponibilidad (a pedido); null = entrega inmediata. */
  dias: number | null;
  premium: boolean;
  /** De otra cuenta de ML (docs/sdd/010): su nombre. null = la principal. */
  cuenta?: string | null;
  /** El precio publicado, según la última lectura (docs/sdd/011). */
  precio?: number | null;
  /** Si es copia de una publicación de la principal: el MLA original. */
  copiaDe?: string | null;
}

/**
 * A qué cuenta de ML se mira y se le aplican los cambios (docs/sdd/011): las dos, sólo la principal
 * (Sendero 3D) o sólo la otra (Sendero Shop).
 */
export type Alcance = "todas" | "principal" | "otra";

export const esDelAlcance = (x: Pick<PublicacionMl, "cuenta">, a: Alcance) => a === "todas" || (a === "principal" ? !x.cuenta : !!x.cuenta);

/** Las publicaciones de una variante en la cuenta (o las cuentas) que se están mirando. */
export const publicacionesDe = (comb: Pick<CombinacionLista, "publicaciones"> | null | undefined, a: Alcance): PublicacionMl[] =>
  (comb?.publicaciones ?? []).filter((x) => esDelAlcance(x, a));

export type Diferencia = "Flex" | "días" | "precio";

/**
 * En qué difiere una variante entre las dos cuentas. Se compara cada publicación de la principal
 * con la de la otra cuenta del mismo tipo (Clásica con Clásica), o con su copia si se sabe cuál es.
 * Sólo lo que se pudo leer de las dos; que falte la copia o que esté pausada no es una diferencia:
 * se ve aparte.
 */
export function diferenciasDe(comb: Pick<CombinacionLista, "publicaciones"> | null | undefined): Diferencia[] {
  const pubs = (comb?.publicaciones ?? []).filter((x) => x.estado !== "otro");
  const otras = pubs.filter((x) => x.cuenta);
  if (!otras.length) return [];
  const out = new Set<Diferencia>();
  for (const p of pubs.filter((x) => !x.cuenta)) {
    const o = otras.find((x) => x.copiaDe === p.mla) ?? otras.find((x) => !x.copiaDe && x.premium === p.premium);
    if (!o) continue;
    if (o.flex !== p.flex) out.add("Flex");
    if ((o.dias ?? null) !== (p.dias ?? null)) out.add("días");
    if (o.precio != null && p.precio != null && Math.round(o.precio) !== Math.round(p.precio)) out.add("precio");
  }
  return [...out];
}

export interface CombinacionLista {
  id: string;
  nombre: string;
  /** El nombre sin el del producto: "Violeta", "95cm · Con Funda". */
  corto: string;
  /** Stock del ERP; null = no tiene fila de stock. */
  stock: number | null;
  vendidas30: number;
  vendidas: number;
  publicaciones: PublicacionMl[];
  web: boolean;
}

/** Dónde está publicado cada producto, con el detalle de cada variante. */
export interface CanalesDeModelo {
  /** Publicaciones de ML por estado, según la última lectura de precios. */
  ml: { activas: number; pausadas: number; otras: number };
  /** Las publicaciones activas y pausadas. */
  mlas: string[];
  entrega: { flex: number; aPedido: number };
  /** Claves del Shop enlazadas. */
  web: number;
  /** Variantes activas que no tienen publicación de ML: las que se pueden crear. */
  sinMl: Array<{ id: string; nombre: string }>;
  /** Las variantes activas, con su stock, sus ventas y sus publicaciones. */
  combinaciones: CombinacionLista[];
  /** Stock del ERP de todo el producto; null = ninguna fila de stock. */
  stock: number | null;
  /** Unidades vendidas en los últimos 30 días y desde siempre, sin los pedidos cancelados. */
  vendidas30: number;
  vendidas: number;
}

export interface RespuestaDeCanales {
  /** La lectura de ML más vieja de las que se muestran: de cuándo es el estado y la entrega. */
  leidoEn: string | null;
  /** Las otras cuentas de ML conectadas, por nombre (docs/sdd/010): habilitan "Copiar a…". */
  otrasCuentas?: string[];
  modelos: Record<string, CanalesDeModelo>;
}

export interface CategoriaLista {
  id: string;
  nombre: string;
  color: string | null;
}

export interface ProductoLista {
  id: string;
  nombre: string;
  sku: string | null;
  serie: string | null;
  consolidadoEnId?: string | null;
  consolidadoEn?: { id: string; nombre: string } | null;
  costoFab: number;
  costoInsumos: number;
  archivo3mfUrl: string | null;
  imagenUrl: string | null;
  activo: boolean;
  esInsumo?: boolean;
  creadoEn: string;
  categorias: Array<{ categoria: CategoriaLista }>;
  variantes: Array<{ nombre: string }>;
}

export interface Filtros {
  texto: string;
  estado: "todos" | "activos" | "inactivos" | "insumos";
  categorias: string[];
  sku: "todos" | "con" | "sin";
  con3mf: boolean;
  conImagen: boolean;
  conVariantes: boolean;
  // Estos cuatro miran cada variante, no el producto.
  ml: "todos" | "publicados" | "pausados" | "sin";
  web: "todos" | "si" | "no";
  stock: "todos" | "con" | "sin";
  entrega: "todas" | "flex" | "a_pedido" | "ninguna";
  /** Sólo las variantes que no están igual en las dos cuentas (docs/sdd/011). */
  difieren: boolean;
}

export const FILTROS_INICIALES: Filtros = {
  texto: "",
  estado: "activos",
  categorias: [],
  sku: "todos",
  con3mf: false,
  conImagen: false,
  conVariantes: false,
  ml: "todos",
  web: "todos",
  stock: "todos",
  entrega: "todas",
  difieren: false,
};

export type Orden = "nuevo" | "antiguo" | "az" | "za" | "vendidos30" | "menos_vendidos30" | "vendidos" | "stock_mas" | "stock_menos" | "costo_mas" | "costo_menos";
export type Agrupar = "nada" | "serie" | "categoria";

/** Lo que se puede elegir: una variante, o el producto entero si no tiene variantes activas. */
export interface Unidad {
  clave: string;
  comb: CombinacionLista | null;
}

export interface Fila {
  p: ProductoLista;
  c: CanalesDeModelo | undefined;
  /** Todas sus unidades. */
  todas: Unidad[];
  /** Las que pasan los filtros de variante: las que se ven y se eligen. */
  unidades: Unidad[];
  /** true si los filtros dejaron afuera alguna de sus variantes. */
  parcial: boolean;
}

export interface Grupo {
  clave: string;
  nombre: string;
  filas: Fila[];
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function unidadesDe(p: Pick<ProductoLista, "id">, c: CanalesDeModelo | undefined): Unidad[] {
  return c?.combinaciones.length ? c.combinaciones.map((comb) => ({ clave: comb.id, comb })) : [{ clave: `m:${p.id}`, comb: null }];
}

/** Los filtros que miran cada variante: con alguno puesto, un producto puede verse a medias. */
export const filtraVariantes = (f: Filtros) => f.ml !== "todos" || f.web !== "todos" || f.stock !== "todos" || f.entrega !== "todas" || f.difieren;

function pasaUnidad(u: Unidad, f: Filtros, alcance: Alcance): boolean {
  // Lo de ML y la entrega miran sólo la cuenta elegida: "sin publicar" en Sendero Shop es sin copiar.
  const pubs = publicacionesDe(u.comb, alcance);
  if (f.difieren && !diferenciasDe(u.comb).length) return false;
  if (f.ml === "publicados" && !pubs.some((x) => x.estado === "active")) return false;
  if (f.ml === "pausados" && !pubs.some((x) => x.estado === "paused")) return false;
  if (f.ml === "sin" && pubs.length > 0) return false;
  if (f.web === "si" && !u.comb?.web) return false;
  if (f.web === "no" && u.comb?.web) return false;
  const stock = u.comb?.stock ?? 0;
  if (f.stock === "con" && stock <= 0) return false;
  if (f.stock === "sin" && stock > 0) return false;
  if (f.entrega === "flex" && !pubs.some((x) => x.flex)) return false;
  if (f.entrega === "a_pedido" && !pubs.some((x) => x.dias != null)) return false;
  if (f.entrega === "ninguna" && !pubs.some((x) => x.estado !== "otro" && !x.flex && x.dias == null)) return false;
  return true;
}

function pasaProducto(p: ProductoLista, f: Filtros): boolean {
  const q = sinAcentos(f.texto);
  if (q && !sinAcentos(p.nombre).includes(q) && !sinAcentos(p.serie ?? "").includes(q) && !sinAcentos(p.sku ?? "").includes(q)) return false;
  if (f.categorias.length && !p.categorias.some(({ categoria }) => f.categorias.includes(categoria.id))) return false;
  if (f.estado === "insumos") {
    if (!p.esInsumo) return false;
  } else {
    if (p.esInsumo) return false;
    if (f.estado === "activos" && !p.activo) return false;
    if (f.estado === "inactivos" && p.activo) return false;
  }
  if (f.con3mf && !p.archivo3mfUrl) return false;
  if (f.conImagen && !p.imagenUrl) return false;
  if (f.conVariantes && !p.variantes?.length) return false;
  if (f.sku === "con" && !p.sku) return false;
  if (f.sku === "sin" && p.sku) return false;
  return true;
}

/** Los productos que pasan los filtros, cada uno con las variantes que se ven. */
export function filtrar(productos: ProductoLista[], canales: Record<string, CanalesDeModelo>, f: Filtros, alcance: Alcance = "todas"): Fila[] {
  const porVariante = filtraVariantes(f);
  const out: Fila[] = [];
  for (const p of productos) {
    if (!pasaProducto(p, f)) continue;
    const c = canales[p.id];
    const todas = unidadesDe(p, c);
    const unidades = porVariante ? todas.filter((u) => pasaUnidad(u, f, alcance)) : todas;
    if (!unidades.length) continue;
    out.push({ p, c, todas, unidades, parcial: unidades.length < todas.length });
  }
  return out;
}

const costo = (p: ProductoLista) => (p.costoFab || 0) + (p.costoInsumos || 0);
const fecha = (p: ProductoLista) => new Date(p.creadoEn).getTime();

const COMPARAR: Record<Orden, (a: Fila, b: Fila) => number> = {
  nuevo: (a, b) => fecha(b.p) - fecha(a.p),
  antiguo: (a, b) => fecha(a.p) - fecha(b.p),
  az: (a, b) => a.p.nombre.localeCompare(b.p.nombre, "es"),
  za: (a, b) => b.p.nombre.localeCompare(a.p.nombre, "es"),
  vendidos30: (a, b) => (b.c?.vendidas30 ?? 0) - (a.c?.vendidas30 ?? 0),
  menos_vendidos30: (a, b) => (a.c?.vendidas30 ?? 0) - (b.c?.vendidas30 ?? 0),
  vendidos: (a, b) => (b.c?.vendidas ?? 0) - (a.c?.vendidas ?? 0),
  stock_mas: (a, b) => (b.c?.stock ?? -1) - (a.c?.stock ?? -1),
  stock_menos: (a, b) => (a.c?.stock ?? -1) - (b.c?.stock ?? -1),
  costo_mas: (a, b) => costo(b.p) - costo(a.p),
  costo_menos: (a, b) => costo(a.p) - costo(b.p),
};

/** Ordenados; a igualdad, por nombre, para que la lista no baile. */
export function ordenar(filas: Fila[], orden: Orden): Fila[] {
  const f = COMPARAR[orden];
  return [...filas].sort((a, b) => f(a, b) || a.p.nombre.localeCompare(b.p.nombre, "es"));
}

const SIN_GRUPO = "￿";

/**
 * Los productos en grupos. Por serie, sin distinguir mayúsculas ni acentos ("One piece" y "One
 * Piece" son el mismo). Por categoría, un producto con dos categorías sale en las dos. Los que no
 * tienen, al final. Con el orden por ventas o stock, los grupos van en ese orden; si no, por nombre.
 */
export function agrupar(filas: Fila[], por: Agrupar, orden: Orden): Grupo[] {
  if (por === "nada") return [{ clave: "", nombre: "", filas }];
  const grupos = new Map<string, { nombres: Map<string, number>; filas: Fila[] }>();
  const sumar = (clave: string, nombre: string, f: Fila) => {
    const g = grupos.get(clave) ?? { nombres: new Map<string, number>(), filas: [] };
    g.nombres.set(nombre, (g.nombres.get(nombre) ?? 0) + 1);
    g.filas.push(f);
    grupos.set(clave, g);
  };
  for (const f of filas) {
    if (por === "serie") {
      const s = f.p.serie?.trim();
      if (s) sumar(sinAcentos(s), s, f);
      else sumar(SIN_GRUPO, "Sin serie", f);
    } else if (f.p.categorias.length) {
      for (const { categoria } of f.p.categorias) sumar(categoria.id, categoria.nombre, f);
    } else sumar(SIN_GRUPO, "Sin categoría", f);
  }
  const out = [...grupos].map(([clave, g]) => ({
    clave,
    // La forma de escribirlo que más se repite.
    nombre: [...g.nombres].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))[0][0],
    filas: g.filas,
  }));
  const total = (g: Grupo, de: (f: Fila) => number) => g.filas.reduce((s, f) => s + de(f), 0);
  const peso: ((g: Grupo) => number) | null =
    orden === "vendidos30" ? (g) => -total(g, (f) => f.c?.vendidas30 ?? 0)
    : orden === "menos_vendidos30" ? (g) => total(g, (f) => f.c?.vendidas30 ?? 0)
    : orden === "vendidos" ? (g) => -total(g, (f) => f.c?.vendidas ?? 0)
    : orden === "stock_mas" ? (g) => -total(g, (f) => f.c?.stock ?? 0)
    : orden === "stock_menos" ? (g) => total(g, (f) => f.c?.stock ?? 0)
    : null;
  return out.sort((a, b) => {
    if (a.clave === SIN_GRUPO || b.clave === SIN_GRUPO) return a.clave === SIN_GRUPO ? (b.clave === SIN_GRUPO ? 0 : 1) : -1;
    return (peso ? peso(a) - peso(b) : 0) || a.nombre.localeCompare(b.nombre, "es");
  });
}

export type EstadoDeTilde = "todas" | "algunas" | "ninguna";

export function estadoDeTilde(claves: string[], elegidos: ReadonlySet<string>): EstadoDeTilde {
  let n = 0;
  for (const k of claves) if (elegidos.has(k)) n++;
  return n === 0 ? "ninguna" : n === claves.length ? "todas" : "algunas";
}

/** Tildar un producto, un grupo o todo: si ya están todas, las saca; si no, las suma a lo elegido. */
export function alternar(elegidos: ReadonlySet<string>, claves: string[]): Set<string> {
  const s = new Set(elegidos);
  if (claves.length && claves.every((k) => s.has(k))) for (const k of claves) s.delete(k);
  else for (const k of claves) s.add(k);
  return s;
}

export interface ResumenDeSeleccion {
  /** Cuántas variantes (o productos enteros) hay elegidas, y de cuántos productos. */
  unidades: number;
  productos: string[];
  /** Los productos con sólo algunas de sus variantes elegidas: activar o desactivar los toca enteros. */
  productosAMedias: number;
  /** Variantes elegidas sin publicación en la cuenta principal: las que se pueden crear. Vacío mirando sólo la otra cuenta. */
  aCrear: Array<{ modeloId: string; combinacionId: string; nombre: string }>;
  /** Publicaciones activas y pausadas de las variantes elegidas, en la cuenta (o cuentas) que se mira. */
  mlas: string[];
  /** Cuántas de esas son de cada cuenta: lo que se muestra antes de aplicar un cambio. */
  porCuenta: { principal: number; otra: number };
  /**
   * Las de la cuenta principal que todavía no tienen copia en la otra: las que se pueden copiar
   * (docs/sdd/010). Vacío mirando sólo la principal.
   */
  mlasPrincipal: string[];
  conStock: string[];
  sinStock: string[];
}

/** Qué hay elegido, mirando todos los productos y no sólo los que se ven con los filtros de ahora. */
export function resumir(productos: ProductoLista[], canales: Record<string, CanalesDeModelo>, elegidos: ReadonlySet<string>, alcance: Alcance = "todas"): ResumenDeSeleccion {
  const r: ResumenDeSeleccion = { unidades: 0, productos: [], productosAMedias: 0, aCrear: [], mlas: [], porCuenta: { principal: 0, otra: 0 }, mlasPrincipal: [], conStock: [], sinStock: [] };
  if (!elegidos.size) return r;
  const mlas = new Map<string, boolean>();
  const principal = new Set<string>();
  for (const p of productos) {
    const todas = unidadesDe(p, canales[p.id]);
    const suyas = todas.filter((u) => elegidos.has(u.clave));
    if (!suyas.length) continue;
    r.unidades += suyas.length;
    r.productos.push(p.id);
    if (suyas.length < todas.length) r.productosAMedias++;
    for (const u of suyas) {
      if (!u.comb) continue;
      const todasLasPubs = u.comb.publicaciones;
      if (alcance !== "otra" && !todasLasPubs.some((x) => !x.cuenta)) r.aCrear.push({ modeloId: p.id, combinacionId: u.comb.id, nombre: u.comb.nombre });
      const copiadas = new Set(todasLasPubs.map((x) => x.copiaDe).filter(Boolean));
      for (const x of todasLasPubs) {
        if (x.estado === "otro") continue;
        if (esDelAlcance(x, alcance)) mlas.set(x.mla, !!x.cuenta);
        if (alcance !== "principal" && !x.cuenta && !copiadas.has(x.mla)) principal.add(x.mla);
      }
      ((u.comb.stock ?? 0) > 0 ? r.conStock : r.sinStock).push(u.clave);
    }
  }
  r.mlas = [...mlas.keys()];
  for (const deOtra of mlas.values()) r.porCuenta[deOtra ? "otra" : "principal"]++;
  r.mlasPrincipal = [...principal];
  return r;
}
