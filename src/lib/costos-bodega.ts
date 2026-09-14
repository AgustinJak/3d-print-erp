import { prisma } from "@/lib/prisma";

/**
 * El costo de producción sale de Bodega, que es donde se sabe.
 *
 * Bodega mide cada modelo una vez —gramos de filamento y tiempo de impresión— y
 * publica esa receta junto con los parámetros del taller (precio del kilo, luz,
 * desgaste). Acá se rearma el costo con los valores del momento.
 *
 * Lo importante es que viaja la receta y no el resultado. Bodega guardaba el
 * número calculado, y ese número no se entera de nada: los que había iban de
 * marzo a septiembre, con el filamento entre $16.000 y $16.500 el kilo cuando ya
 * estaba a $18.300. Con la receta, subir el precio del filamento en Bodega mueve
 * todos los costos del ERP en la próxima pasada, sin recostear modelo por modelo.
 *
 * El puente es `Stock.bodegaModelId`: cada fila de stock del ERP —que es una
 * pieza física concreta, "Sanemi Katana 95cm"— apunta al modelo de Bodega que la
 * produce. Por eso el costo se resuelve por fila y no por modelo: una katana de
 * 65 y una de 95 son dos piezas distintas con dos recetas distintas.
 */

export interface ParametrosCosto {
  precioKg: number;
  precioKwh: number;
  consumoW: number;
  desgasteHoras: number;
  precioRepuestos: number;
  margenError: number;
}

/** Los mismos defaults que la calculadora de Bodega, por si la fila no existe. */
export const PARAMETROS_POR_DEFECTO: ParametrosCosto = {
  precioKg: 16000,
  precioKwh: 140,
  consumoW: 120,
  desgasteHoras: 4320,
  precioRepuestos: 150000,
  margenError: 20,
};

export interface Receta {
  bodegaModelId: string;
  nombre: string;
  gramos: number;
  segundos: number;
  /** `null` = el modelo nunca se costeó, así que no se sabe. No es lo mismo que 0. */
  insumos: number | null;
}

export interface CostoDeFila {
  stockId: string;
  etiqueta: string;
  fab: number;
  insumos: number;
  total: number;
  receta: Receta;
  /** Bodega tiene los gramos pero nadie le puso insumos: puede estar corto. */
  insumosSinDeclarar: boolean;
}

/**
 * La fórmula de la calculadora de Bodega, igual a `src/renderer/src/lib/calc.ts`.
 *
 * Está duplicada a propósito: son dos aplicaciones distintas que no comparten
 * código, y preferimos una copia con nombre y comentario antes que un paquete
 * compartido para seis líneas. Si cambia allá, cambia acá.
 */
export function fabricacionDeReceta(p: ParametrosCosto, gramos: number, segundos: number): number {
  const horas = segundos / 3600;
  const material = (p.precioKg / 1000) * gramos;
  const luz = (p.consumoW / 1000) * p.precioKwh * horas;
  const desgaste = (p.precioRepuestos / p.desgasteHoras) * horas;
  return (material + luz + desgaste) * (1 + p.margenError / 100);
}

export async function leerParametros(): Promise<ParametrosCosto> {
  const filas = await prisma.$queryRaw<
    Array<{
      precio_kg: unknown;
      precio_kwh: unknown;
      consumo_w: unknown;
      desgaste_horas: unknown;
      precio_repuestos: unknown;
      margen_error: unknown;
    }>
  >`SELECT precio_kg, precio_kwh, consumo_w, desgaste_horas, precio_repuestos, margen_error
      FROM bodega.cost_settings WHERE id = 'default'`;

  const f = filas[0];
  if (!f) return PARAMETROS_POR_DEFECTO;
  // Postgres devuelve numeric como string o Decimal según el driver.
  const n = (v: unknown, d: number) => {
    const x = typeof v === "number" ? v : Number(v);
    return Number.isFinite(x) ? x : d;
  };
  return {
    precioKg: n(f.precio_kg, PARAMETROS_POR_DEFECTO.precioKg),
    precioKwh: n(f.precio_kwh, PARAMETROS_POR_DEFECTO.precioKwh),
    consumoW: n(f.consumo_w, PARAMETROS_POR_DEFECTO.consumoW),
    desgasteHoras: n(f.desgaste_horas, PARAMETROS_POR_DEFECTO.desgasteHoras),
    precioRepuestos: n(f.precio_repuestos, PARAMETROS_POR_DEFECTO.precioRepuestos),
    margenError: n(f.margen_error, PARAMETROS_POR_DEFECTO.margenError),
  };
}

/** Las recetas completas, por id de modelo de Bodega. */
export async function leerRecetas(): Promise<Map<string, Receta>> {
  const filas = await prisma.$queryRaw<
    Array<{ id: string; name: string; filament_grams: number | null; print_time_seconds: number | null; insumos: unknown }>
  >`SELECT id, name, filament_grams, print_time_seconds, insumos
      FROM bodega.models
     WHERE filament_grams IS NOT NULL AND print_time_seconds IS NOT NULL`;

  const out = new Map<string, Receta>();
  for (const f of filas) {
    if (f.filament_grams == null || f.print_time_seconds == null) continue;
    const ins = f.insumos == null ? null : Number(f.insumos);
    out.set(f.id, {
      bodegaModelId: f.id,
      nombre: f.name,
      gramos: f.filament_grams,
      segundos: f.print_time_seconds,
      insumos: Number.isFinite(ins as number) ? (ins as number) : null,
    });
  }
  return out;
}

/**
 * Cuánto cuesta hoy cada fila de stock, según Bodega.
 *
 * Sólo devuelve las filas que tienen receta. Las que no están se resuelven con
 * el costo cargado a mano en el ERP, como hasta ahora: mejor un costo viejo que
 * un cero que haga ver una venta como pura ganancia.
 */
export async function costosPorFilaDeStock(tenantId: string): Promise<Map<string, CostoDeFila>> {
  const [parametros, recetas, filas] = await Promise.all([
    leerParametros(),
    leerRecetas(),
    prisma.stock.findMany({
      where: { tenantId, bodegaModelId: { not: null } },
      select: { id: true, etiqueta: true, bodegaModelId: true },
    }),
  ]);

  const out = new Map<string, CostoDeFila>();
  for (const f of filas) {
    const receta = f.bodegaModelId ? recetas.get(f.bodegaModelId) : undefined;
    if (!receta) continue;
    const fab = fabricacionDeReceta(parametros, receta.gramos, receta.segundos);
    const insumos = receta.insumos ?? 0;
    out.set(f.id, {
      stockId: f.id,
      etiqueta: f.etiqueta ?? receta.nombre,
      fab,
      insumos,
      total: fab + insumos,
      receta,
      insumosSinDeclarar: receta.insumos == null,
    });
  }
  return out;
}
