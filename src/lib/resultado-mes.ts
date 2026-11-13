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
 *
 * Por cuenta de ML (docs/sdd/010 y 011): `cuenta` = "principal" u "otra" deja sólo lo de esa cuenta.
 * Shay, las percepciones cargadas a mano y los pagos a la logística de Flex (que son gastos del
 * negocio) van con la principal, así lo de las dos cuentas suma lo de "todas".
 */

export type CuentaDeCargos = "todas" | "principal" | "otra";

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
  /** Lo que entró de verdad por Flex y lo pagado a la logística. */
  flex: { ingresos: number; pagos: number; deOtro: number };
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
export async function cargosPorMes(tenantId: string, cuenta: CuentaDeCargos = "todas"): Promise<Map<string, CargosDelMes>> {
  // null = la principal en cargos y Flex; '' en los períodos.
  const deCuenta = cuenta === "todas" ? {} : { cuentaMlId: cuenta === "principal" ? null : { not: null } };
  const periodoDeCuenta = cuenta === "todas" ? {} : cuenta === "principal" ? { cuentaMlId: "" } : { cuentaMlId: { not: "" } };
  const conLaPrincipal = cuenta !== "otra";
  const [lineas, periodos, cierresTodos, compartidosTodos, bonificaciones, pagosFlexTodos] = await Promise.all([
    prisma.cargoMl.findMany({
      where: { tenantId, ...deCuenta },
      select: { periodo: true, tipo: true, clase: true, concepto: true, bonificacion: true, monto: true, diaGasto: true, campanaId: true, cuentaMlId: true },
    }),
    prisma.periodoMl.findMany({ where: { tenantId, grupo: "ML", ...periodoDeCuenta }, select: { clave: true, completo: true, cuentaMlId: true } }),
    prisma.ventaTercero.findMany({
      where: { tenantId },
      select: { anio: true, mes: true, publicidad: true, bruto: true, brutoPropio: true, brutoOtros: true },
    }),
    prisma.gastoCompartido.findMany({ where: { tenantId }, select: { anio: true, mes: true, percepciones: true } }),
    prisma.flexMl.findMany({ where: { tenantId, ...deCuenta }, select: { dia: true, monto: true, deOtro: true } }),
    prisma.gasto.findMany({ where: { tenantId, categoria: { contains: "flex", mode: "insensitive" }, fecha: { lte: new Date() } }, select: { fecha: true, monto: true } }),
  ]);

  // Lo que es de la principal (Shay, lo cargado a mano, los pagos a la logística) no va con la otra.
  const cierres = conLaPrincipal ? cierresTodos : [];
  const compartidos = conLaPrincipal ? compartidosTodos : [];
  const pagosFlex = conLaPrincipal ? pagosFlexTodos : [];
  const cierrePorMes = new Map(cierres.map((c) => [claveDeMes(c.anio, c.mes), c]));
  const aMano = new Map(compartidos.map((c) => [claveDeMes(c.anio, c.mes), c.percepciones]));

  // Los meses que hay que mostrar: los de los cargos, y el de cada período de percepciones.
  const meses = new Set<string>(lineas.filter((l) => l.clase !== "percepcion").map((l) => l.diaGasto.slice(0, 7)));
  for (const l of lineas) {
    if (l.clase !== "percepcion") continue;
    const [a, m] = l.periodo.split("-").map(Number);
    meses.add(m === 1 ? claveDeMes(a - 1, 12) : claveDeMes(a, m - 1));
  }

  for (const b of bonificaciones) meses.add(b.dia.slice(0, 7));
  const mesDe = (d: Date) => claveDeMes(d.getFullYear(), d.getMonth() + 1);
  for (const g of pagosFlex) meses.add(mesDe(g.fecha));

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
    // Cada cuenta por su lado: con el período cerrado, lo que factura ML; si no, la principal usa lo
    // cargado a mano en /shay (la aproximada) y la otra todavía no tiene número.
    const porCuenta = [...new Set([...(conLaPrincipal ? [""] : []), ...periodos.filter((p) => p.clave === periodo && p.cuentaMlId !== "").map((p) => p.cuentaMlId)])];
    const partes = porCuenta.map((cu) => {
      const cerrado = periodos.some((p) => p.clave === periodo && p.cuentaMlId === cu && p.completo);
      const suyas = lineas.filter((l) => l.periodo === periodo && l.clase === "percepcion" && (l.cuentaMlId ?? "") === cu);
      if (cerrado) return { total: suyas.reduce((s, x) => s + firmado(x), 0), estado: "ml" as EstadoPercepciones, lineas: suyas };
      const manual = cu === "" ? (aMano.get(mm) ?? 0) : 0;
      return { total: manual, estado: (manual > 0 ? "aproximada" : "pendiente") as EstadoPercepciones, lineas: [] as typeof suyas };
    });
    const percepciones = {
      total: partes.reduce((s, p) => s + p.total, 0),
      // Todo cerrado es "ml"; si alguna es aproximada, el total también.
      estado: (partes.length && partes.every((p) => p.estado === "ml") ? "ml" : partes.some((p) => p.estado === "aproximada") ? "aproximada" : "pendiente") as EstadoPercepciones,
      periodo,
      detalle: agrupar(partes.flatMap((p) => p.lineas)),
    };

    const otrasLineas = delMes.filter((l) => l.clase === "otro");
    const otros = { total: otrasLineas.reduce((s, x) => s + firmado(x), 0), detalle: agrupar(otrasLineas) };

    const c = cierrePorMes.get(mm);
    const base = c ? c.bruto + c.brutoPropio + c.brutoOtros : 0;
    const proporcion = c && base > 0 ? c.bruto / base : 0;
    const shayPub = c?.publicidad ?? 0;
    const shayPerc = percepciones.total * proporcion;

    const total = productAds + seguidores - anulaciones;
    const delFlex = bonificaciones.filter((b) => b.dia.startsWith(mm));
    const flex = {
      ingresos: delFlex.filter((b) => !b.deOtro).reduce((s, b) => s + b.monto, 0),
      deOtro: delFlex.filter((b) => b.deOtro).reduce((s, b) => s + b.monto, 0),
      pagos: pagosFlex.filter((g) => mesDe(g.fecha) === mm).reduce((s, g) => s + g.monto, 0),
    };
    out.set(mm, {
      flex,
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
    flex: { ingresos: 0, pagos: 0, deOtro: 0 },
    shay: { publicidad: 0, percepciones: 0, proporcion: 0, hayCierre: false, total: 0 },
    neto: 0,
  };
}

/** La última vez que se leyó la facturación, para mostrarla. */
export async function ultimaLecturaDeMl(tenantId: string): Promise<string | null> {
  const p = await prisma.periodoMl.findFirst({ where: { tenantId }, orderBy: { leidoEn: "desc" }, select: { leidoEn: true } });
  return p?.leidoEn.toISOString() ?? null;
}
