/**
 * Las tarifas de Mercado Libre como dato (docs/sdd/006, spec 003): el tipo y las cuentas, sin
 * base ni red, para que las use también la pantalla. Las lee y las guarda `tarifas-ml.ts`.
 */

export interface TarifasMl {
  leidoEn: string;
  /** % de ML por categoría (sin el recargo por cuotas): el mismo para Clásica y Premium. */
  categorias: Record<string, number>;
  /** Cargo fijo por tramo del precio que paga el cliente, ordenado por `desde`. */
  fijos: Array<{ desde: number; monto: number }>;
  /** Lo cobrado de más por las cuotas, en % del precio: por publicación y en general. */
  recargoCuotas: { general: number; porPublicacion: Record<string, number>; ventas: number };
}

/** Si nunca hubo ventas Premium con cuotas, lo medido el 2026-10-29. */
export const RECARGO_CUOTAS_POR_DEFECTO = 8.5;

/** El cargo fijo a un precio, con los tramos guardados. */
export function cargoFijo(t: Pick<TarifasMl, "fijos">, precio: number): number {
  let monto = 0;
  for (const f of t.fijos) if (precio >= f.desde) monto = f.monto;
  return monto;
}

/** Sin la categoría de un producto, la comisión más alta de las que se conocen: no quedarse corto. */
export function pctMasAlto(t: Pick<TarifasMl, "categorias"> | null): number | null {
  const v = Object.values(t?.categorias ?? {});
  return v.length ? Math.max(...v) : null;
}
