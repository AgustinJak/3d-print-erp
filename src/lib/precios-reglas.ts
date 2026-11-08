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

/** Un mes de la reserva para el envío gratis de la web contra lo absorbido (docs/sdd/006, spec 009, REQ-5). */
export interface MesDeReserva {
  mes: string;
  pedidos: number;
  gratis: number;
  vendido: number;
  absorbido: number;
  /** Lo absorbido, en % de lo vendido. */
  pct: number;
  /** A más de un punto de la reserva: hay que revisarla. */
  seAleja: boolean;
  /** Pedidos gratis de un método que nadie pagó, y por eso no se pudieron valorar. */
  sinValorar: number;
}

export interface ComparacionDeReserva {
  reservaPct: number;
  /** Lo que pagaron en promedio los clientes por cada método: con eso se valora un envío gratis. */
  referencia: Record<string, number>;
  meses: MesDeReserva[];
}

/**
 * El Shop no guarda cuánto salió el envío de un pedido gratis, así que lo absorbido es aproximado:
 * cada pedido gratis vale lo que pagaron en promedio los demás con ese método. Los retiros no cuentan.
 */
export function compararReserva(
  pedidos: Array<{ mes: string; metodoEnvio: string | null; precioEnvio: number; vendido: number }>,
  reservaPct: number,
  mesesAMostrar = 4
): ComparacionDeReserva {
  const pagados = new Map<string, number[]>();
  for (const p of pedidos) {
    if (p.metodoEnvio && p.precioEnvio > 0) pagados.set(p.metodoEnvio, [...(pagados.get(p.metodoEnvio) ?? []), p.precioEnvio]);
  }
  const referencia = Object.fromEntries([...pagados].map(([m, xs]) => [m, Math.round(xs.reduce((a, x) => a + x, 0) / xs.length)]));
  const porMes = new Map<string, MesDeReserva>();
  for (const p of pedidos) {
    const m = porMes.get(p.mes) ?? { mes: p.mes, pedidos: 0, gratis: 0, vendido: 0, absorbido: 0, pct: 0, seAleja: false, sinValorar: 0 };
    m.pedidos++;
    m.vendido += p.vendido;
    if (p.metodoEnvio && p.metodoEnvio !== "retiro" && p.precioEnvio === 0) {
      m.gratis++;
      if (referencia[p.metodoEnvio] != null) m.absorbido += referencia[p.metodoEnvio];
      else m.sinValorar++;
    }
    porMes.set(p.mes, m);
  }
  const meses = [...porMes.values()]
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .slice(0, mesesAMostrar)
    .map((m) => {
      const pct = m.vendido > 0 ? Math.round((m.absorbido / m.vendido) * 1000) / 10 : 0;
      return { ...m, pct, seAleja: m.vendido > 0 && Math.abs(pct - reservaPct) > 1 };
    });
  return { reservaPct, referencia, meses };
}
