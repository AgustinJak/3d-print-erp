import type { Falta } from "@/lib/precios-combinacion";

/**
 * Las reglas de la pantalla de Precios que valen igual en el servidor y en el navegador
 * (docs/sdd/003, spec 004). Sin Prisma: la página las importa.
 */

/** Más que esto, en más o en menos, se marca en rojo y pide una confirmación aparte (RN-4). */
export const CAMBIO_GRANDE_PCT = 30;

export const esGrande = (pct: number | null) => pct != null && Math.abs(pct) > CAMBIO_GRANDE_PCT;

/** "Con diferencia" (RN-1): el propuesto y el publicado difieren en más de $1. */
export const conDiferencia = (f: { diferencia: number | null }) => f.diferencia != null && Math.abs(f.diferencia) > 1;

const TEXTO_FALTA: Record<Falta["motivo"], (e: string) => string> = {
  sin_pieza: (e) => `${e}: no tiene fila de stock`,
  pieza_sin_bodega: (e) => `${e}: no está enlazada a una pieza de Bodega`,
  pieza_sin_receta: (e) => `${e}: la pieza no tiene gramos y tiempo en Bodega`,
  insumo_sin_costo: (e) => `${e}: el insumo no tiene costo de Bodega`,
  sin_precio_posible: (e) => `${e}: los gastos y el margen se comen todo el precio`,
};

export const PREFIJO_FALTA = "falta costear";

export function textoDeFalta(falta: Falta[]): string {
  return `${PREFIJO_FALTA} — ` + falta.map((f) => TEXTO_FALTA[f.motivo](f.etiqueta)).join("; ");
}
