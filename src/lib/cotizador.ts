import { desgloseDeFabricacion, type DesgloseFabricacion, type ParametrosCosto } from "@/lib/costos-formula";
import { margenDe, precioConMargen, precioConPromo, redondear, techoDeRedondeo, type Canal, type Gasto, type GastosVenta, type Redondeo } from "@/lib/precios-formula";

/**
 * El cotizador rápido (docs/sdd/013): con gramos, tiempo, material e insumos, el costo de
 * fabricación (la fórmula de Bodega) y el precio de cada canal con el motor de precios del ERP
 * (margen sobre el precio, lo que cobra ML, envío, IIBB, redondeo y promo). Sin base: se calcula
 * en la pantalla mientras se escribe, y no se guarda nada.
 *
 * Usa los gastos generales: en una publicación real de ML el precio sale de lo que cobra ML por esa
 * publicación (categoría, tipo), así que puede diferir un poco. Es para cotizar, no para publicar.
 */

export interface EntradaCotizacion {
  gramos: number;
  /** Tiempo de impresión en minutos. */
  minutos: number;
  /** Precio del kilo del material elegido; null = el de los parámetros. */
  precioKg: number | null;
  /** Lo que se compra aparte, por unidad: imanes, cadena, caja… */
  insumos: number;
  /** El margen sobre el precio, en %. null = el de la configuración. */
  margen: number | null;
}

export interface PrecioDeCanal {
  canal: Canal;
  nombre: string;
  /** Lo que paga el cliente. */
  precio: number;
  /** En ML, lo que se publica (inflado por la promo); en los otros, igual al precio. */
  publicado: number;
  ganancia: number;
  margen: number;
  gastos: Gasto[];
}

export interface Cotizacion {
  fabricacion: DesgloseFabricacion;
  insumos: number;
  costo: number;
  canales: PrecioDeCanal[];
}

const NOMBRES: Record<Canal, string> = { ml: "Mercado Libre", web: "Web", personalizado: "Venta directa" };

export function cotizar(e: EntradaCotizacion, parametros: ParametrosCosto, general: GastosVenta, redondeo: Redondeo): Cotizacion {
  const p = { ...parametros, ...(e.precioKg && e.precioKg > 0 ? { precioKg: e.precioKg } : {}) };
  const fabricacion = desgloseDeFabricacion(p, Math.max(0, e.gramos || 0), Math.max(0, e.minutos || 0) * 60);
  const insumos = Math.max(0, e.insumos || 0);
  const g: GastosVenta = { ...general, ...(e.margen != null && e.margen >= 0 && e.margen < 90 ? { margenMinorista: e.margen } : {}) };
  const fab = fabricacion.total;

  const canales = (["ml", "web", "personalizado"] as const).map((canal): PrecioDeCanal => {
    const crudo = precioConMargen(g, canal, fab, insumos).recomendado.precio;
    if (!Number.isFinite(crudo) || crudo <= 0 || fab + insumos <= 0) return { canal, nombre: NOMBRES[canal], precio: 0, publicado: 0, ganancia: 0, margen: 0, gastos: [] };
    const techo = techoDeRedondeo(g, canal, crudo);
    const precio = redondear(crudo, redondeo, techo);
    const publicado = canal === "ml" ? precioConPromo(precio, g.mlPromoPct, techo).publicado : precio;
    const m = margenDe(g, canal, precio, fab, insumos);
    return { canal, nombre: NOMBRES[canal], precio, publicado, ganancia: m.ganancia, margen: m.margen, gastos: m.gastos };
  });

  return { fabricacion, insumos, costo: fab + insumos, canales };
}
