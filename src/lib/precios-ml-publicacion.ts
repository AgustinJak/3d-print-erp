import {
  margenDe,
  precioConGanancia,
  precioMl,
  precioConPromo,
  redondear,
  techoDeRedondeo,
  type GastosVenta,
  type Redondeo,
} from "@/lib/precios-formula";
import { cargoFijo, RECARGO_CUOTAS_POR_DEFECTO, type TarifasMl } from "@/lib/tarifas-ml-reglas";
import type { LecturaMl } from "@/lib/precios-ml";

/**
 * El precio de Mercado Libre con lo que cobra ML de verdad (docs/sdd/006, specs 003 y 006).
 *
 * **La ganancia del producto no cambia**: sale de la fórmula de siempre (`tresPrecios`, el margen
 * sobre ML con la comisión de referencia de la configuración), y con ella la web y los
 * personalizados, como siempre. Lo que cambia es cuánto tiene que valer cada publicación de ML para
 * dejar esa ganancia con lo que ML cobra de verdad.
 *
 * Una primera versión (2026-10-29) recalculaba el margen sobre ML con la comisión real: como la
 * ganancia es un % del precio de ML, subía la ganancia y con ella la web (el Angel de $26.490 a
 * $51.490, su web de $27.890 a $32.690). Eso no es lo que se busca: ML más caro no es más ganancia.
 *
 * Dos pasos:
 *
 * 1. **La opción 1** (Clásica, sin cuotas, envío según el umbral) es el precio que deja la ganancia
 *    del producto con la comisión de su categoría y el cargo fijo de su tramo.
 * 2. **Cada publicación**, y la opción 2 (3 cuotas y envío gratis), se suben hasta dejar **la misma
 *    plata que la opción 1 ya redondeada**, con sus costos: el recargo por cuotas y el envío
 *    gratis. Es lo que Agustín hacía a mano con el Soporte de Auricular Angel.
 *
 * Funciones puras: las tarifas y la lectura vienen de afuera.
 */

/** Lo que cobra ML por una publicación, sin contar el cargo fijo (que depende del precio). */
export interface CostosMl {
  /** % de la categoría. */
  pct: number;
  /** Recargo por cuotas sin interés, en % del precio; 0 sin cuotas. */
  recargoCuotas: number;
  /** true = envío gratis aunque el precio no llegue al umbral. */
  envioGratis: boolean;
  /** Lo que cuesta el envío cuando lo pagamos. */
  costoEnvio: number;
  /** Lo que no salió de ML y se tomó de la configuración: la fila lo dice. */
  estimado: string[];
}

export interface PrecioMl {
  /** Lo que paga el cliente. */
  final: number;
  /** Lo que se publica: inflado por la promo si hay. */
  publicado: number;
  /** Lo que deja, al precio final. */
  ganancia: number;
  cargoFijo: number;
  costos: CostosMl;
}

/**
 * El techo de la promo: si el cliente paga menos que el umbral del envío, el publicado no puede
 * pasarlo, y si lo pasaría no se aplica la promo (`precioConPromo`, spec 003). Se mira el umbral de
 * la configuración y no el de la publicación: una con envío gratis tampoco se publica arriba de
 * $30.000 por la promo.
 */
const techoDePromo = (g: GastosVenta, final: number) => (final < g.mlEnvioDesde ? g.mlEnvioDesde - 1 : undefined);

/** Los gastos de la configuración con lo que cobra ML para esta publicación. */
export function gastosConCostos(g: GastosVenta, c: CostosMl, fijo: number): GastosVenta {
  return {
    ...g,
    mlComisionPct: c.pct,
    mlCuotasPct: c.recargoCuotas,
    mlCargoFijo: fijo,
    // Con envío gratis se paga siempre; si no, la regla del umbral de siempre.
    mlEnvioDesde: c.envioGratis ? 0 : g.mlEnvioDesde,
    mlEnvioCosto: c.costoEnvio,
  };
}

/**
 * Como el cargo fijo depende del precio y el precio del cargo fijo, se prueba hasta que el precio
 * caiga en el tramo del cargo con que se calculó. Si dos tramos se pasan la pelota (el precio cae
 * justo en el corte), se queda el más caro: nunca un precio que deja menos de lo pedido.
 */
function conCargoFijo<T>(t: Pick<TarifasMl, "fijos"> | null, fijoRespaldo: number, calcular: (fijo: number) => T, precioDe: (r: T) => number): { r: T; fijo: number } {
  if (!t?.fijos.length) return { r: calcular(fijoRespaldo), fijo: fijoRespaldo };
  let fijo = cargoFijo(t, 0);
  let r = calcular(fijo);
  const vistos = new Map<number, T>([[fijo, r]]);
  for (let i = 0; i < 5; i++) {
    const siguiente = cargoFijo(t, precioDe(r));
    if (siguiente === fijo) return { r, fijo };
    if (vistos.has(siguiente)) {
      // Oscila entre dos tramos: el que da el precio más alto.
      const otro = vistos.get(siguiente)!;
      return precioDe(otro) > precioDe(r) ? { r: otro, fijo: siguiente } : { r, fijo };
    }
    fijo = siguiente;
    r = calcular(fijo);
    vistos.set(fijo, r);
  }
  return { r, fijo };
}

/**
 * El precio de una publicación que deja `ganancia`, con sus costos. Redondeado como la pieza y con
 * su promo, igual que la opción 1.
 */
export function precioParaGanancia(
  g: GastosVenta,
  fabricacion: number,
  insumos: number,
  redondeo: Redondeo,
  ganancia: number,
  costos: CostosMl,
  tarifas: Pick<TarifasMl, "fijos"> | null
): PrecioMl {
  const { r, fijo } = conCargoFijo(
    tarifas,
    g.mlCargoFijo,
    (f) => {
      const gp = gastosConCostos(g, costos, f);
      const crudo = precioConGanancia(gp, "ml", fabricacion, insumos, ganancia).precio;
      const techo = techoDeRedondeo(gp, "ml", crudo);
      const final = redondear(crudo, redondeo, techo);
      return { final, techo, gp };
    },
    (x) => x.final
  );
  return {
    final: r.final,
    publicado: precioConPromo(r.final, g.mlPromoPct, techoDePromo(g, r.final)).publicado,
    ganancia: margenDe(r.gp, "ml", r.final, fabricacion, insumos).ganancia,
    cargoFijo: fijo,
    costos,
  };
}

/** Los costos de la opción 1: la Clásica sin cuotas, con el envío según el umbral. */
export function costosDeOpcionUno(g: GastosVenta, pctDelProducto: number, estimado: string[] = []): CostosMl {
  return { pct: pctDelProducto, recargoCuotas: 0, envioGratis: false, costoEnvio: g.mlEnvioCosto, estimado };
}

/** La publicación tiene cuotas sin interés: Premium, o una campaña de cuotas. */
export const tieneCuotas = (l: Pick<LecturaMl, "tipo" | "campaniaCuotas">) =>
  l.tipo === "gold_pro" || !!l.campaniaCuotas;

/** A cuál de las dos opciones corresponde una publicación (spec 006). */
export function opcionDe(l: Pick<LecturaMl, "tipo" | "campaniaCuotas" | "envioGratis">): 1 | 2 {
  return tieneCuotas(l) ? 2 : 1;
}

/**
 * Los costos de una publicación leída de ML. Lo que falta sale de la configuración y queda
 * anotado como estimado.
 */
export function costosDeLectura(
  l: LecturaMl,
  mla: string,
  tarifas: TarifasMl | null,
  g: GastosVenta,
  pctDelProducto: number
): CostosMl {
  const estimado: string[] = [];
  const pctCat = l.categoria ? tarifas?.categorias[l.categoria] : undefined;
  if (pctCat == null) estimado.push("comisión de la categoría");
  const cuotas = tieneCuotas(l);
  const recargo = cuotas ? (tarifas?.recargoCuotas.porPublicacion[mla] ?? tarifas?.recargoCuotas.general ?? RECARGO_CUOTAS_POR_DEFECTO) : 0;
  if (cuotas && tarifas?.recargoCuotas.porPublicacion[mla] == null) estimado.push("recargo por cuotas (sin ventas propias)");
  // El costo del envío de esta publicación, lo pague siempre (envío gratis) o sólo si cruza el umbral.
  const costoEnvio = l.costoEnvio ?? g.mlEnvioCosto;
  if (l.costoEnvio == null) estimado.push("costo del envío");
  return { pct: pctCat ?? pctDelProducto, recargoCuotas: recargo, envioGratis: !!l.envioGratis, costoEnvio, estimado };
}

/**
 * La opción 2 de un producto que todavía no la tiene: 3 cuotas y envío gratis, con el costo de
 * envío de la configuración (o el de una publicación suya que ya tenga envío gratis).
 */
export function costosDeOpcionDos(tarifas: TarifasMl | null, g: GastosVenta, pctDelProducto: number, costoEnvio: number | null): CostosMl {
  const estimado: string[] = [];
  if (costoEnvio == null) estimado.push("costo del envío");
  if (!tarifas?.recargoCuotas.ventas) estimado.push("recargo por cuotas");
  return {
    pct: pctDelProducto,
    recargoCuotas: tarifas?.recargoCuotas.general ?? RECARGO_CUOTAS_POR_DEFECTO,
    envioGratis: true,
    costoEnvio: costoEnvio ?? g.mlEnvioCosto,
    estimado,
  };
}

/**
 * La opción 1 con el precio publicado fijado a mano (spec 002): no se calcula, se mide. El cliente
 * paga lo publicado menos la promo, y lo que deja a ese precio es la meta de la opción 2. Sirve
 * para los productos que no conviene llevar arriba de los $30.000 aunque ganen menos (los porta
 * auriculares, decisión de Agustín del 2026-10-29).
 */
export function opcionUnoFija(
  g: GastosVenta,
  fabricacion: number,
  insumos: number,
  publicado: number,
  costos: CostosMl,
  tarifas: Pick<TarifasMl, "fijos"> | null
): PrecioMl {
  const final = Math.round(publicado * (1 - g.mlPromoPct / 100));
  const fijo = tarifas?.fijos.length ? cargoFijo(tarifas, final) : g.mlCargoFijo;
  return {
    final,
    publicado,
    ganancia: margenDe(gastosConCostos(g, costos, fijo), "ml", final, fabricacion, insumos).ganancia,
    cargoFijo: fijo,
    costos,
  };
}

/**
 * La opción 1 con el margen sobre el precio de venta (decisión de Agustín, 2026-10-30): precio =
 * costo total / (1 − gastos variables − margen), con lo que ML cobra de verdad. El costo total es
 * impresión más insumos; el margen va sobre todo el precio. Con la regla del umbral de $30.000 de
 * `precioMl` (si cruzar no conviene, quedarse abajo).
 */
export function opcionUnoConMargen(
  g: GastosVenta,
  fabricacion: number,
  insumos: number,
  redondeo: Redondeo,
  costos: CostosMl,
  tarifas: Pick<TarifasMl, "fijos"> | null
): PrecioMl {
  const { r, fijo } = conCargoFijo(
    tarifas,
    g.mlCargoFijo,
    (f) => {
      const gp = gastosConCostos(g, costos, f);
      const crudo = precioMl(gp, fabricacion, insumos).recomendado.precio;
      const techo = techoDeRedondeo(gp, "ml", crudo);
      return { final: redondear(crudo, redondeo, techo), techo, gp };
    },
    (x) => x.final
  );
  return {
    final: r.final,
    publicado: precioConPromo(r.final, g.mlPromoPct, techoDePromo(g, r.final)).publicado,
    ganancia: margenDe(r.gp, "ml", r.final, fabricacion, insumos).ganancia,
    cargoFijo: fijo,
    costos,
  };
}
