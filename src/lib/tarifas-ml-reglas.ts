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

/**
 * Una Premium sin campaña de 3 cuotas: ML la deja en 6 y cobra esto (cotizador y pantalla de ML,
 * 2026-11-04). Pasa con la opción 2 recién creada, hasta que alguien elige 3 cuotas en ML.
 */
export const RECARGO_6_CUOTAS = 12.9;

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

/** El paquete de una publicación: alto, ancho y largo en cm, peso en gramos. */
export interface PaqueteMl {
  alto: number;
  ancho: number;
  largo: number;
  peso: number;
}

/**
 * Las medidas que tiene cargadas una publicación. Las creadas como User Product las tienen en los
 * atributos ("30 cm", "400 g"); las más viejas, en `shipping.dimensions` ("110x15x15,760").
 */
export function paqueteDeItem(item: { attributes?: Array<{ id: string; value_name?: string | null }>; shipping?: { dimensions?: string | null } }): PaqueteMl | null {
  const vistas = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/.exec(item.shipping?.dimensions ?? "");
  if (vistas) {
    const [alto, ancho, largo, peso] = vistas.slice(1).map(Number);
    return { alto, ancho, largo, peso };
  }
  const valor = (id: string) => item.attributes?.find((a) => a.id === id)?.value_name ?? "";
  const numero = (texto: string) => parseFloat(texto.replace(",", "."));
  const pesoTexto = valor("SELLER_PACKAGE_WEIGHT");
  const paquete = {
    alto: numero(valor("SELLER_PACKAGE_HEIGHT")),
    ancho: numero(valor("SELLER_PACKAGE_WIDTH")),
    largo: numero(valor("SELLER_PACKAGE_LENGTH")),
    peso: numero(pesoTexto) * (/kg/i.test(pesoTexto) ? 1000 : 1),
  };
  return Object.values(paquete).every((x) => x > 0) ? paquete : null;
}
