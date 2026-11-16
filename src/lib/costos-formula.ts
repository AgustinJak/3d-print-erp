/**
 * La fórmula de costo de fabricación de Bodega, sin base: la usan el servidor (costos-bodega) y la
 * pantalla del cotizador (docs/sdd/013), que calcula mientras se escribe.
 *
 * Igual a `src/renderer/src/lib/calc.ts` de Bodega. Está duplicada a propósito: son dos
 * aplicaciones que no comparten código. Si cambia allá, cambia acá.
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

export interface DesgloseFabricacion {
  material: number;
  luz: number;
  desgaste: number;
  margenError: number;
  total: number;
}

/** El costo de fabricación de una pieza, con su desglose. */
export function desgloseDeFabricacion(p: ParametrosCosto, gramos: number, segundos: number): DesgloseFabricacion {
  const horas = segundos / 3600;
  const material = (p.precioKg / 1000) * gramos;
  const luz = (p.consumoW / 1000) * p.precioKwh * horas;
  const desgaste = (p.precioRepuestos / p.desgasteHoras) * horas;
  const margenError = (material + luz + desgaste) * (p.margenError / 100);
  return { material, luz, desgaste, margenError, total: material + luz + desgaste + margenError };
}

export function fabricacionDeReceta(p: ParametrosCosto, gramos: number, segundos: number): number {
  return desgloseDeFabricacion(p, gramos, segundos).total;
}
