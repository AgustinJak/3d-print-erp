/**
 * Lo que cuesta producir una unidad.
 *
 * El costo va en dos partes que se mueven por separado: **imprimir la pieza**
 * (filamento, máquina) y **los insumos** que se le agregan después (cuerda,
 * imanes, pintura, la caja). Tenerlas juntas obligaba a recalcular a mano cada
 * vez que subía una sola de las dos.
 *
 * Todo lo que necesite "cuánto me cuesta esto" pasa por acá, así no queda una
 * suma incompleta en algún rincón.
 */

export interface CostoModelo {
  costoFab: number;
  costoInsumos: number;
}

export interface CostoVariante {
  costoFabAdicional: number;
  costoInsumosAdicional: number;
}

/** Producir una unidad del modelo, sin variantes. */
export function costoModelo(m: CostoModelo): number {
  return m.costoFab + m.costoInsumos;
}

/** Lo que suma una variante (una funda, una medida más grande). */
export function costoVariante(v: CostoVariante): number {
  return v.costoFabAdicional + v.costoInsumosAdicional;
}

/** El modelo más todas las variantes elegidas. */
export function costoTotal(m: CostoModelo, variantes: CostoVariante[]): number {
  return costoModelo(m) + variantes.reduce((a, v) => a + costoVariante(v), 0);
}

/** Los campos que hay que traer de la base para poder calcular un costo. */
export const SELECT_COSTO_MODELO = { costoFab: true, costoInsumos: true } as const;
export const SELECT_COSTO_VARIANTE = { costoFabAdicional: true, costoInsumosAdicional: true } as const;
