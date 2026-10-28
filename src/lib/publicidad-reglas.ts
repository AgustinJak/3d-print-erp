import type { GastosVenta } from "@/lib/precios-bodega";

/**
 * Las reglas de Publicidad que valen igual en la página, en el servidor y en el MCP de Claude
 * (docs/sdd/005, specs 001 y 002). Sin Prisma ni red: la página las importa y el script de
 * pruebas las corre sueltas.
 */

/* ───────────────────────── Escritura ───────────────────────── */

/**
 * Si el ERP y el MCP pueden cambiar la publicidad en ML, o sólo leerla y decir qué cambiar.
 *
 * Apagado desde el 2026-10-28: ML contesta 401 "User does not have permission to write." a toda
 * escritura de Product Ads, aunque el token tenga `urn:ml:mktp:ads:/read-write`. Según su soporte,
 * en MLA sólo están publicadas las lecturas y escribir requiere una habilitación interna que se
 * pide por ticket en el Developer Partner Program (docs/sdd/005, bitácora). Con esto en false, la
 * vista previa sigue andando y se usa para decir qué tocar en el panel.
 */
export const ESCRITURA_EN_ML = false;

/** Dónde se cambia a mano, con las palabras de la doc de ML. */
export const PANEL_DE_ML = "Mercado Libre › Mi perfil › Publicidad";

/* ───────────────────────── Período ───────────────────────── */

export type Periodo = "7d" | "30d" | "mes" | "mes-pasado";

export const PERIODOS: Array<{ id: Periodo; texto: string }> = [
  { id: "7d", texto: "7 días" },
  { id: "30d", texto: "30 días" },
  { id: "mes", texto: "Este mes" },
  { id: "mes-pasado", texto: "Mes pasado" },
];

/** ML no da métricas de más de 90 días atrás. */
export const DIAS_MAXIMOS = 90;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Las fechas (YYYY-MM-DD, hora local) de un período, con hoy incluido. */
export function rangoDe(periodo: Periodo, hoy = new Date()): { desde: string; hasta: string } {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const atras = (n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
  switch (periodo) {
    case "7d":
      return { desde: iso(atras(6)), hasta: iso(d) };
    case "30d":
      return { desde: iso(atras(29)), hasta: iso(d) };
    case "mes":
      return { desde: iso(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: iso(d) };
    case "mes-pasado":
      return {
        desde: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        hasta: iso(new Date(d.getFullYear(), d.getMonth(), 0)),
      };
  }
}

export const esPeriodo = (v: unknown): v is Periodo => PERIODOS.some((p) => p.id === v);

/* ───────────────────────── Margen (spec 001) ───────────────────────── */

/**
 * Lo que deja una venta en ML antes de pagar publicidad (RN-1).
 *
 * Los mismos gastos con que la calculadora de Bodega arma el precio, sin la línea de Product
 * Ads: justamente es lo que se está midiendo. `costo` es el de la venta entera (un pack de 3
 * cuesta 3 piezas).
 */
export function gananciaAntesDePublicidad(g: GastosVenta, precio: number, costo: number): number {
  const pct = (g.mlComisionPct + g.mlCuotasPct + g.mlOtrosPct + g.iibbPct) / 100;
  const envio = precio >= g.mlEnvioDesde ? g.mlEnvioCosto : 0;
  return precio * (1 - pct) - g.mlCargoFijo - envio - costo;
}

/**
 * El ROAS de equilibrio (RN-2): debajo de este número, lo que se paga de publicidad por venta se
 * come toda la ganancia. `null` si la venta ya pierde sin publicidad.
 */
export function roasMinimo(precio: number, ganancia: number): number | null {
  return ganancia > 0 && precio > 0 ? precio / ganancia : null;
}

/** El ROAS que da por hecho el precio: Bodega suma la publicidad como un % fijo de lo vendido. */
export const roasQueAsumeElPrecio = (g: GastosVenta): number | null =>
  g.mlPublicidadPct > 0 ? 100 / g.mlPublicidadPct : null;

/* ───────────────────────── Alertas (spec 001, REQ-5) ───────────────────────── */

/** Menos que esto gastado sin vender es ruido, no una alerta. */
export const GASTO_MINIMO_ALERTA = 5000;
/** Desde cuánto de impresiones perdidas por presupuesto vale la pena decirlo. */
export const PERDIDA_POR_PRESUPUESTO_ALERTA = 0.1;

export interface Alerta {
  tipo: "sin-ventas" | "pierde" | "no-cierra" | "presupuesto";
  texto: string;
  /** true = pierde plata; false = oportunidad. */
  grave: boolean;
}

export const decimal = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const pesosTexto = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

export function alertasDe(x: {
  gasto: number;
  ventas: number;
  roasMinimo: number | null;
  /** true si hay costo y aun así la venta pierde sin publicidad. */
  noCierra?: boolean;
  activa: boolean;
  perdidoPorPresupuesto?: number | null;
}): Alerta[] {
  const out: Alerta[] = [];
  const roas = x.gasto > 0 ? x.ventas / x.gasto : null;
  if (x.noCierra) {
    out.push({ tipo: "no-cierra", texto: "Con este precio la venta pierde plata aun sin publicidad", grave: true });
  }
  if (x.gasto >= GASTO_MINIMO_ALERTA && x.ventas === 0) {
    out.push({ tipo: "sin-ventas", texto: `Gastó ${pesosTexto(x.gasto)} sin ventas atribuidas`, grave: true });
  } else if (roas != null && x.roasMinimo != null && x.ventas > 0 && roas < x.roasMinimo) {
    out.push({
      tipo: "pierde",
      texto: `ROAS ${decimal(roas)} contra un mínimo de ${decimal(x.roasMinimo)}: cada venta por publicidad pierde plata`,
      grave: true,
    });
  }
  const perdido = x.perdidoPorPresupuesto ?? 0;
  const rinde = roas != null && (x.roasMinimo == null || roas >= x.roasMinimo);
  if (x.activa && perdido >= PERDIDA_POR_PRESUPUESTO_ALERTA && rinde) {
    out.push({
      tipo: "presupuesto",
      texto: `Pierde ${Math.round(perdido * 100)} % de las impresiones por presupuesto`,
      grave: false,
    });
  }
  return out;
}

/* ───────────────────────── Cambios (spec 002) ───────────────────────── */

export type Estrategia = "profitability" | "increase" | "visibility";
export type EstadoMl = "active" | "paused";

export const ESTRATEGIAS: Record<Estrategia, { texto: string; ayuda: string }> = {
  profitability: { texto: "Rentabilidad", ayuda: "Menos anuncios, a quien es más probable que compre" },
  increase: { texto: "Crecimiento", ayuda: "Equilibrio entre rentabilidad y visibilidad" },
  visibility: { texto: "Visibilidad", ayuda: "Más inversión para llegar a más gente" },
};

export const esEstrategia = (v: unknown): v is Estrategia => typeof v === "string" && v in ESTRATEGIAS;
export const esEstadoMl = (v: unknown): v is EstadoMl => v === "active" || v === "paused";

export const ROAS_OBJETIVO_MIN = 1;
export const ROAS_OBJETIVO_MAX = 35;
/** Más que esto de cambio de presupuesto pide una confirmación aparte (RN-2). */
export const CAMBIO_GRANDE_PRESUPUESTO = 0.5;
/** Cambiar una campaña antes de esto la saca de nuevo del aprendizaje (RN-4). */
export const DIAS_DE_APRENDIZAJE = 7;

export interface CampoCambiado {
  campo: string;
  etiqueta: string;
  antes: string | number | null;
  despues: string | number;
}

export interface Revision<T> {
  /** Lo que se mandaría a ML: sólo los campos que cambian. */
  envio: T;
  cambios: CampoCambiado[];
  /** Si hay alguno, no se manda. */
  errores: string[];
  /** `aparte` = hace falta tildar una confirmación más (RN-2, RN-3). */
  avisos: Array<{ texto: string; aparte: boolean }>;
}

export interface CampanaActual {
  budget: number;
  status: string;
  roas_target: number | null;
  strategy: string;
}

export interface PedidoCampana {
  budget?: number;
  status?: string;
  roas_target?: number;
  strategy?: string;
}

function diasDesde(fecha: Date | null, ahora: Date): number | null {
  return fecha ? (ahora.getTime() - fecha.getTime()) / 86_400_000 : null;
}

function avisoDeAprendizaje(ultimoCambio: Date | null, ahora: Date): { texto: string; aparte: boolean } | null {
  const dias = diasDesde(ultimoCambio, ahora);
  if (dias == null || dias >= DIAS_DE_APRENDIZAJE) return null;
  const hace = dias < 1 ? "hoy" : `hace ${Math.floor(dias)} ${Math.floor(dias) === 1 ? "día" : "días"}`;
  return { texto: `La cambiaste ${hace}. Cada cambio la vuelve a poner en aprendizaje: conviene esperar a que se asiente.`, aparte: false };
}

export function revisarCambioCampana(
  actual: CampanaActual,
  pedido: PedidoCampana,
  ctx: { esShay: boolean; ultimoCambio: Date | null; ahora?: Date }
): Revision<PedidoCampana> {
  const ahora = ctx.ahora ?? new Date();
  const envio: PedidoCampana = {};
  const cambios: CampoCambiado[] = [];
  const errores: string[] = [];
  const avisos: Revision<PedidoCampana>["avisos"] = [];

  if (pedido.budget !== undefined) {
    const b = Number(pedido.budget);
    if (!Number.isFinite(b) || b <= 0) errores.push("El presupuesto diario tiene que ser mayor que cero.");
    else if (Math.round(b) !== Math.round(actual.budget)) {
      envio.budget = Math.round(b);
      cambios.push({ campo: "budget", etiqueta: "Presupuesto diario", antes: actual.budget, despues: envio.budget });
      const rel = actual.budget > 0 ? Math.abs(envio.budget - actual.budget) / actual.budget : 1;
      if (rel > CAMBIO_GRANDE_PRESUPUESTO) {
        avisos.push({ texto: `El presupuesto cambia ${Math.round(rel * 100)} %.`, aparte: true });
      }
    }
  }
  if (pedido.roas_target !== undefined) {
    const r = Math.round(Number(pedido.roas_target) * 10) / 10;
    if (!Number.isFinite(r) || r < ROAS_OBJETIVO_MIN || r > ROAS_OBJETIVO_MAX) {
      errores.push(`El ROAS objetivo va de ${ROAS_OBJETIVO_MIN} a ${ROAS_OBJETIVO_MAX}.`);
    } else if (r !== actual.roas_target) {
      envio.roas_target = r;
      cambios.push({ campo: "roas_target", etiqueta: "ROAS objetivo", antes: actual.roas_target, despues: r });
    }
  }
  if (pedido.strategy !== undefined) {
    const s = String(pedido.strategy).toLowerCase();
    if (!esEstrategia(s)) errores.push("La estrategia es rentabilidad, crecimiento o visibilidad.");
    else if (s !== actual.strategy) {
      envio.strategy = s;
      cambios.push({
        campo: "strategy",
        etiqueta: "Estrategia",
        antes: esEstrategia(actual.strategy) ? ESTRATEGIAS[actual.strategy].texto : actual.strategy,
        despues: ESTRATEGIAS[s].texto,
      });
    }
  }
  if (pedido.status !== undefined) {
    const s = String(pedido.status).toLowerCase();
    if (!esEstadoMl(s)) errores.push("El estado es activa o pausada.");
    else if (s !== actual.status) {
      envio.status = s;
      cambios.push({ campo: "status", etiqueta: "Estado", antes: textoEstado(actual.status), despues: textoEstado(s) });
    }
  }

  if (!errores.length && !cambios.length) errores.push("No hay nada que cambiar.");
  if (ctx.esShay) avisos.push({ texto: "Es una campaña de Shay.", aparte: true });
  const aprendizaje = avisoDeAprendizaje(ctx.ultimoCambio, ahora);
  if (aprendizaje && cambios.length) avisos.push(aprendizaje);
  return { envio, cambios, errores, avisos };
}

export interface AnuncioActual {
  status: string;
  campaign_id: number;
}

export interface PedidoAnuncio {
  status?: string;
  campaign_id?: number;
}

export function revisarCambioAnuncio(
  actual: AnuncioActual,
  pedido: PedidoAnuncio,
  ctx: { campanas: Map<number, { nombre: string; esShay: boolean }> }
): Revision<PedidoAnuncio> {
  const envio: PedidoAnuncio = {};
  const cambios: CampoCambiado[] = [];
  const errores: string[] = [];
  const avisos: Revision<PedidoAnuncio>["avisos"] = [];
  // ML le pone campaña 0 a lo que no está en ninguna: moverlo a una es "agregarlo".
  const nombre = (id: number) => (id ? (ctx.campanas.get(id)?.nombre ?? `campaña ${id}`) : "Sin campaña");

  if (pedido.campaign_id !== undefined) {
    const c = Number(pedido.campaign_id);
    if (!ctx.campanas.has(c)) errores.push("Esa campaña no existe en la cuenta.");
    else if (c !== actual.campaign_id) {
      envio.campaign_id = c;
      cambios.push({ campo: "campaign_id", etiqueta: "Campaña", antes: nombre(actual.campaign_id), despues: nombre(c) });
      if (ctx.campanas.get(c)?.esShay || ctx.campanas.get(actual.campaign_id)?.esShay) {
        avisos.push({ texto: "Pasa de o hacia una campaña de Shay.", aparte: true });
      }
    }
  }
  if (pedido.status !== undefined) {
    const s = String(pedido.status).toLowerCase();
    if (!esEstadoMl(s)) errores.push("El estado es activo o pausado.");
    else if (s !== actual.status.toLowerCase()) {
      envio.status = s;
      cambios.push({ campo: "status", etiqueta: "Estado", antes: textoEstado(actual.status), despues: textoEstado(s) });
    }
  }
  // Al moverlo, ML pide también el estado: se manda el que queda.
  if (envio.campaign_id !== undefined && envio.status === undefined) {
    envio.status = actual.status.toLowerCase() === "paused" ? "paused" : "active";
  }
  if (!errores.length && !cambios.length) errores.push("No hay nada que cambiar.");
  if (!errores.length && ctx.campanas.get(actual.campaign_id)?.esShay && envio.campaign_id === undefined) {
    avisos.push({ texto: "Es un anuncio de una campaña de Shay.", aparte: true });
  }
  return { envio, cambios, errores, avisos };
}

const ESTADOS: Record<string, string> = {
  active: "Activa",
  paused: "Pausada",
  // Los tres de abajo son de anuncios; ML no documenta qué significan, esto es lo que se ve.
  idle: "Sin actividad",
  hold: "Retenido por ML",
  empty: "Publicación no activa",
};

/** El estado de ML en palabras. Sirve para campañas y anuncios. */
export const textoEstado = (s: string) => ESTADOS[s.toLowerCase()] ?? s.toLowerCase();
