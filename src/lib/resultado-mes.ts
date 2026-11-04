import { prisma } from "@/lib/prisma";
import { periodoDelMes } from "@/lib/facturacion-ml";

/**
 * De la ganancia bruta a la neta, con lo que factura ML (docs/sdd/007).
 *
 * Una sola cuenta para Finanzas y el panel. Todo sale de `cargos_ml`, o sea de la facturación de
 * ML, salvo lo que el ERP ya sabe (ventas, costo, gastos) y el cierre de Shay.
 *
 * - **Publicidad:** por el día del gasto, así un mes calendario se puede sumar aunque ML facture
 *   del 9 al 8. Con IVA y sin lo anulado, porque es lo que cobra.
 * - **Percepciones:** ML las informa al cerrar el período y no por día, así que van enteras: el
 *   mes M lleva las del período que cierra el 8 de M+1, como la pantalla de ML. Mientras no cerró
 *   no hay número oficial: se usa lo cargado a mano en /shay, marcado como aproximado.
 * - **Otros cargos:** por la fecha del cargo.
 * - **Lo de Shay** se muestra aparte, para que los totales coincidan con la pantalla de ML.
 */

export type EstadoPercepciones = "ml" | "aproximada" | "pendiente";

export interface LineaDeCargo {
  concepto: string;
  monto: number;
}

export interface CargosDelMes {
  publicidad: {
    productAds: number;
    seguidores: number;
    anulaciones: number;
    total: number;
    /** Cargos de Product Ads que no coinciden con ninguna campaña. Son reales, pero sin dueño. */
    sinCampana: number;
  };
  percepciones: {
    total: number;
    estado: EstadoPercepciones;
    /** El período de ML de donde salen: "2026-11-01" va del 9/10 al 8/11. */
    periodo: string;
    detalle: LineaDeCargo[];
  };
  otros: { total: number; detalle: LineaDeCargo[] };
  /** Lo que de todo eso paga Shay: sus campañas y su parte de las percepciones. */
  shay: { publicidad: number; percepciones: number; proporcion: number; hayCierre: boolean; total: number };
  /** Lo que le queda a Sendero: publicidad + percepciones + otros − Shay. */
  neto: number;
}

const firmado = (f: { monto: number; bonificacion: boolean }) => (f.bonificacion ? -f.monto : f.monto);

function agrupar(filas: Array<{ concepto: string; monto: number; bonificacion: boolean }>): LineaDeCargo[] {
  const m = new Map<string, number>();
  for (const f of filas) m.set(f.concepto, (m.get(f.concepto) ?? 0) + firmado(f));
  return [...m].map(([concepto, monto]) => ({ concepto, monto })).sort((a, b) => b.monto - a.monto);
}

const claveDeMes = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;

/** Los cargos de ML de todos los meses con datos, por "YYYY-MM". */
export async function cargosPorMes(tenantId: string): Promise<Map<string, CargosDelMes>> {
  const [lineas, periodos, cierres, compartidos] = await Promise.all([
    prisma.cargoMl.findMany({
      where: { tenantId },
      select: { periodo: true, tipo: true, clase: true, concepto: true, bonificacion: true, monto: true, diaGasto: true, campanaId: true },
    }),
    prisma.periodoMl.findMany({ where: { tenantId, grupo: "ML" }, select: { clave: true, completo: true } }),
    prisma.ventaTercero.findMany({
      where: { tenantId },
      select: { anio: true, mes: true, publicidad: true, bruto: true, brutoPropio: true, brutoOtros: true },
    }),
    prisma.gastoCompartido.findMany({ where: { tenantId }, select: { anio: true, mes: true, percepciones: true } }),
  ]);

  const completos = new Set(periodos.filter((p) => p.completo).map((p) => p.clave));
  const cierrePorMes = new Map(cierres.map((c) => [claveDeMes(c.anio, c.mes), c]));
  const aMano = new Map(compartidos.map((c) => [claveDeMes(c.anio, c.mes), c.percepciones]));

  // Los meses que hay que mostrar: los de los cargos, y el de cada período de percepciones.
  const meses = new Set<string>(lineas.filter((l) => l.clase !== "percepcion").map((l) => l.diaGasto.slice(0, 7)));
  for (const l of lineas) {
    if (l.clase !== "percepcion") continue;
    const [a, m] = l.periodo.split("-").map(Number);
    meses.add(m === 1 ? claveDeMes(a - 1, 12) : claveDeMes(a, m - 1));
  }

  const out = new Map<string, CargosDelMes>();
  for (const mm of meses) {
    const [anio, mes] = mm.split("-").map(Number);
    const delMes = lineas.filter((l) => l.diaGasto.startsWith(mm));
    const pub = delMes.filter((l) => l.clase === "publicidad");
    const suma = (f: typeof pub) => f.reduce((s, x) => s + x.monto, 0);
    const productAds = suma(pub.filter((l) => l.tipo === "PADS"));
    const seguidores = suma(pub.filter((l) => l.tipo === "CDLIT"));
    const anulaciones = suma(pub.filter((l) => l.bonificacion));
    const sinCampana = suma(pub.filter((l) => l.tipo === "PADS" && l.campanaId == null));

    const periodo = periodoDelMes(anio, mes);
    const dePercepcion = lineas.filter((l) => l.periodo === periodo && l.clase === "percepcion");
    const cerrado = completos.has(periodo);
    const manual = aMano.get(mm) ?? 0;
    const percepciones = cerrado
      ? { total: dePercepcion.reduce((s, x) => s + firmado(x), 0), estado: "ml" as const, periodo, detalle: agrupar(dePercepcion) }
      : manual > 0
        ? { total: manual, estado: "aproximada" as const, periodo, detalle: [] }
        : { total: 0, estado: "pendiente" as const, periodo, detalle: [] };

    const otrasLineas = delMes.filter((l) => l.clase === "otro");
    const otros = { total: otrasLineas.reduce((s, x) => s + firmado(x), 0), detalle: agrupar(otrasLineas) };

    const c = cierrePorMes.get(mm);
    const base = c ? c.bruto + c.brutoPropio + c.brutoOtros : 0;
    const proporcion = c && base > 0 ? c.bruto / base : 0;
    const shayPub = c?.publicidad ?? 0;
    const shayPerc = percepciones.total * proporcion;

    const total = productAds + seguidores - anulaciones;
    out.set(mm, {
      publicidad: { productAds, seguidores, anulaciones, total, sinCampana },
      percepciones,
      otros,
      shay: { publicidad: shayPub, percepciones: shayPerc, proporcion, hayCierre: !!c, total: shayPub + shayPerc },
      neto: total + percepciones.total + otros.total - shayPub - shayPerc,
    });
  }
  return out;
}

export function cargosVacios(anio: number, mes: number): CargosDelMes {
  return {
    publicidad: { productAds: 0, seguidores: 0, anulaciones: 0, total: 0, sinCampana: 0 },
    percepciones: { total: 0, estado: "pendiente", periodo: periodoDelMes(anio, mes), detalle: [] },
    otros: { total: 0, detalle: [] },
    shay: { publicidad: 0, percepciones: 0, proporcion: 0, hayCierre: false, total: 0 },
    neto: 0,
  };
}

/** La última vez que se leyó la facturación, para mostrarla. */
export async function ultimaLecturaDeMl(tenantId: string): Promise<string | null> {
  const p = await prisma.periodoMl.findFirst({ where: { tenantId }, orderBy: { leidoEn: "desc" }, select: { leidoEn: true } });
  return p?.leidoEn.toISOString() ?? null;
}
