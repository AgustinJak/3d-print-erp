import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { cargarContextoDePrecios, cargarDelErp, preciosDeCombinaciones, type ContextoDePrecios } from "@/lib/precios-combinacion";
import { esRedondeo, margenesDeTramos, TRAMOS_WEB, type GastosVenta, type Redondeo } from "@/lib/precios-formula";

/**
 * La configuración de precios del ERP (docs/sdd/006, spec 001): leerla, ver cómo quedaría un
 * cambio y guardarlo con su historial. Lo que se edita es `config_precios`; la crea la migración
 * (`scripts/sdd-006-migrar.ts`).
 *
 * Comisión, cargo fijo y cuotas de ML no se editan: salen de lo que cobra ML (spec 003). Los de la
 * configuración quedan como respaldo para cuando ML no conteste.
 */

export type CampoConfig = keyof GastosVenta;

export interface DefinicionDeCampo {
  campo: CampoConfig;
  grupo: "Margen y promo" | "Mercado Libre" | "Web" | "Impuestos" | "Respaldo";
  etiqueta: string;
  unidad: "%" | "$";
  ayuda: string;
  min: number;
  max: number;
}

/** Los campos que se editan, con qué afectan (RN-2). */
export const CAMPOS: DefinicionDeCampo[] = [
  { campo: "margenMinorista", grupo: "Margen y promo", etiqueta: "Margen", unidad: "%", min: 5, max: 80, ayuda: "Sobre el precio de venta de ML. La web y personalizados dejan los mismos pesos, y nunca menos que este %. Cada producto puede tener el suyo." },
  { campo: "mlPromoPct", grupo: "Margen y promo", etiqueta: "Promo de ML", unidad: "%", min: 0, max: 60, ayuda: "El publicado se infla este % para que el cliente pague el precio calculado con la promo. Si eso lo pasa de los $30.000, se publica sin promo." },
  { campo: "mlPublicidadPct", grupo: "Mercado Libre", etiqueta: "Publicidad de ML", unidad: "%", min: 0, max: 40, ayuda: "Lo que se gasta en Product Ads por venta. Sube el precio de ML." },
  { campo: "mlOtrosPct", grupo: "Mercado Libre", etiqueta: "Otros cargos de ML", unidad: "%", min: 0, max: 10, ayuda: "Cargos chicos que ML cobra aparte." },
  { campo: "mlEnvioDesde", grupo: "Mercado Libre", etiqueta: "Envío gratis obligatorio desde", unidad: "$", min: 0, max: 200000, ayuda: "El umbral de ML. Arriba, el envío se suma al precio sin margen." },
  { campo: "mlEnvioCosto", grupo: "Mercado Libre", etiqueta: "Costo del envío de ML", unidad: "$", min: 0, max: 100000, ayuda: "Se usa cuando ML no cotizó el envío de la publicación." },
  { campo: "webCobroPct", grupo: "Web", etiqueta: "Cobro en la web", unidad: "%", min: 0, max: 20, ayuda: "Mercado Pago, promediado con las transferencias." },
  { campo: "webPublicidadPct", grupo: "Web", etiqueta: "Publicidad de la web", unidad: "%", min: 0, max: 40, ayuda: "Meta, TikTok." },
  { campo: "webEnvioGratisDesde", grupo: "Web", etiqueta: "Envío gratis desde", unidad: "$", min: 0, max: 500000, ayuda: "Tiene que ser el mismo que el del panel del Shop. 0 = siempre gratis, con el envío adentro de cada precio." },
  { campo: "webEnvioCosto", grupo: "Web", etiqueta: "Envío promedio", unidad: "$", min: 0, max: 100000, ayuda: "Lo que cuesta en promedio un envío de la web." },
  { campo: "webEnvioReservaPct", grupo: "Web", etiqueta: "Reserva para el envío gratis", unidad: "%", min: 0, max: 20, ayuda: "Un % de cada precio de la web que paga los envíos gratis. Con los pedidos de abril a octubre, un umbral de $40.000 se llevaba el 1,6 % de lo vendido." },
  { campo: "iibbPct", grupo: "Impuestos", etiqueta: "IIBB", unidad: "%", min: 0, max: 15, ayuda: "Ingresos brutos, en todos los canales que declaran." },
  { campo: "mlComisionPct", grupo: "Respaldo", etiqueta: "Comisión de ML", unidad: "%", min: 0, max: 40, ayuda: "Sólo si ML no contesta: lo normal es la comisión de la categoría de cada publicación." },
  { campo: "mlCargoFijo", grupo: "Respaldo", etiqueta: "Cargo fijo de ML", unidad: "$", min: 0, max: 20000, ayuda: "Sólo si ML no contesta: lo normal es el del tramo de precio." },
];

export interface ConfigDePrecios {
  /** false = el ERP todavía no tiene la suya y Precios calcula con la de Bodega. */
  existe: boolean;
  gastos: GastosVenta;
  redondeo: Redondeo;
  actualizadoEn: string | null;
  usuario: string | null;
}

export interface Ejemplo {
  combinacionId: string;
  producto: string;
  costo: number;
  ml: number;
  mlPublicado: number;
  web: number;
  personalizado: number;
  ganancia: number | null;
}

export interface ResumenDeTramo {
  desde: number;
  descuento: number;
  piso: number;
  peor: { producto: string; margen: number } | null;
  mediana: number | null;
  debajo: number;
}

export interface CambioDeConfig {
  id: string;
  creadoEn: string;
  usuario: string | null;
  cambios: Array<{ campo: string; antes: unknown; despues: unknown }>;
}

export async function leerConfig(tenantId: string): Promise<ConfigDePrecios> {
  const cx = await cargarContextoDePrecios(tenantId);
  const fila = await prisma.configPrecios.findUnique({ where: { tenantId } });
  return {
    existe: !!fila,
    gastos: cx.general.gastos,
    redondeo: cx.general.redondeo,
    actualizadoEn: fila?.actualizadoEn.toISOString() ?? null,
    usuario: fila?.usuario ?? null,
  };
}

/** Lo que pasaría con estos gastos: tres productos de ejemplo y los tramos de la web. */
export async function simular(tenantId: string, gastos: GastosVenta, redondeo: Redondeo): Promise<{ ejemplos: Ejemplo[]; tramos: ResumenDeTramo[] }> {
  const base = await cargarContextoDePrecios(tenantId);
  const cx: ContextoDePrecios = {
    ...base,
    general: { gastos, redondeo, deBodega: false, origen: "erp" },
    erp: base.erp ?? (await cargarDelErp(tenantId)),
  };
  const ps = (await preciosDeCombinaciones(tenantId, {}, cx)).filter((p) => p.precios && p.costo);
  // Por costo, que no depende de la configuración: así el antes y el después son los mismos tres.
  const costo = (p: (typeof ps)[number]) => p.costo!.fabricacion + p.costo!.insumos;
  const porCosto = [...ps].sort((a, b) => costo(a) - costo(b) || a.combinacionId.localeCompare(b.combinacionId));
  const elegidos = porCosto.length ? [porCosto[0], porCosto[Math.floor(porCosto.length / 2)], porCosto[porCosto.length - 1]] : [];
  const ejemplos = [...new Map(elegidos.map((p) => [p.combinacionId, p])).values()].map((p) => ({
    combinacionId: p.combinacionId,
    producto: p.nombre,
    costo: Math.round(p.costo!.fabricacion + p.costo!.insumos),
    ml: p.precios!.ml,
    mlPublicado: p.precios!.mlPublicado,
    web: p.precios!.web,
    personalizado: p.precios!.personalizado,
    ganancia: p.precios!.ganancia != null ? Math.round(p.precios!.ganancia) : null,
  }));

  const porTramo = new Map<number, Array<{ producto: string; margen: number; llega: boolean }>>(TRAMOS_WEB.map((t) => [t.desde, []]));
  for (const p of ps) {
    const g = { ...gastos, margenMinorista: p.politica.margen, mlPromoPct: p.politica.promo };
    for (const t of margenesDeTramos(g, p.precios!.web, p.costo!.fabricacion, p.costo!.insumos)) porTramo.get(t.desde)!.push({ producto: p.nombre, margen: t.margen, llega: t.llega });
  }
  const tramos = TRAMOS_WEB.map((t) => {
    const xs = porTramo.get(t.desde)!.sort((a, b) => a.margen - b.margen);
    return {
      desde: t.desde,
      descuento: t.descuento,
      piso: t.piso,
      peor: xs[0] ? { producto: xs[0].producto, margen: Math.round(xs[0].margen * 10) / 10 } : null,
      mediana: xs.length ? Math.round(xs[Math.floor(xs.length / 2)].margen * 10) / 10 : null,
      debajo: xs.filter((x) => !x.llega).length,
    };
  });
  return { ejemplos, tramos };
}

/** Los gastos de hoy con los cambios pedidos, validados. */
export function aplicarCambios(actual: GastosVenta, cambios: Partial<Record<CampoConfig, number>>): { gastos: GastosVenta; errores: string[] } {
  const gastos = { ...actual };
  const errores: string[] = [];
  for (const [k, v] of Object.entries(cambios) as Array<[CampoConfig, number]>) {
    const d = CAMPOS.find((c) => c.campo === k);
    if (!d) {
      errores.push(`${k} no se puede editar`);
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v) || v < d.min || v > d.max) {
      errores.push(`${d.etiqueta} tiene que ir de ${d.min} a ${d.max}`);
      continue;
    }
    gastos[k] = v;
  }
  return { gastos, errores };
}

/** Guarda y deja el cambio en el historial (REQ-3). */
export async function guardarConfig(tenantId: string, gastos: GastosVenta, redondeo: Redondeo, usuario: string | null): Promise<void> {
  const fila = await prisma.configPrecios.findUnique({ where: { tenantId } });
  if (!fila) throw new Error("El ERP todavía no tiene su configuración de precios: corré la migración (scripts/sdd-006-migrar.ts).");
  if (!esRedondeo(redondeo)) throw new Error("redondeo inválido");
  const despues = { ...gastos, redondeo } as unknown as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.configPrecios.update({ where: { tenantId }, data: { gastos: despues, actualizadoEn: new Date(), usuario } }),
    prisma.cambioConfigPrecios.create({ data: { tenantId, antes: fila.gastos as Prisma.InputJsonValue, despues, usuario } }),
  ]);
}

export async function historialConfig(tenantId: string, limite = 30): Promise<CambioDeConfig[]> {
  const filas = await prisma.cambioConfigPrecios.findMany({ where: { tenantId }, orderBy: { creadoEn: "desc" }, take: limite });
  return filas.map((f) => {
    const antes = (f.antes ?? {}) as Record<string, unknown>;
    const despues = (f.despues ?? {}) as Record<string, unknown>;
    const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])];
    return {
      id: f.id,
      creadoEn: f.creadoEn.toISOString(),
      usuario: f.usuario,
      cambios: claves.filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k])).map((campo) => ({ campo, antes: antes[campo] ?? null, despues: despues[campo] ?? null })),
    };
  });
}

/* ───────────────────────── Margen de varios productos a la vez ───────────────────────── */

export interface FilaDeMargen {
  combinacionId: string;
  modeloId: string;
  producto: string;
  antes: { margen: number; mlPublicado: number; web: number; personalizado: number; ganancia: number | null } | null;
  despues: { margen: number; mlPublicado: number; web: number; personalizado: number; ganancia: number | null } | null;
}

/**
 * Cómo quedan las combinaciones de estos productos con otro margen (Agustín, 2026-10-30: "agarrar
 * varias y cambiar el % de 35 a 40"). `margen` null = volver al general. No guarda nada.
 */
export async function simularMargen(tenantId: string, modeloIds: string[], margen: number | null): Promise<FilaDeMargen[]> {
  const base = await cargarContextoDePrecios(tenantId);
  if (!base.erp) throw new Error("El margen por producto se usa con la configuración de precios del ERP.");
  const modelos = new Map(base.erp.modelos);
  for (const id of modeloIds) {
    const m = modelos.get(id) ?? { politica: { margen: null, redondeo: null, promo: null }, precioMlFijo: null, categoriaMl: null };
    modelos.set(id, { ...m, politica: { ...m.politica, margen } });
  }
  const cx: ContextoDePrecios = { ...base, erp: { ...base.erp, modelos } };
  const [antes, despues] = await Promise.all([preciosDeCombinaciones(tenantId, { modeloIds }, base), preciosDeCombinaciones(tenantId, { modeloIds }, cx)]);
  const d = new Map(despues.map((p) => [p.combinacionId, p]));
  const resumen = (p: (typeof antes)[number] | undefined) =>
    p?.precios ? { margen: p.politica.margen, mlPublicado: p.precios.mlPublicado, web: p.precios.web, personalizado: p.precios.personalizado, ganancia: p.precios.ganancia != null ? Math.round(p.precios.ganancia) : null } : null;
  return antes.map((p) => ({ combinacionId: p.combinacionId, modeloId: p.modeloId, producto: p.nombre, antes: resumen(p), despues: resumen(d.get(p.combinacionId)) }));
}

/** Guarda el margen de varios productos. No publica nada: los precios nuevos se aplican en Precios. */
export async function guardarMargen(tenantId: string, modeloIds: string[], margen: number | null): Promise<number> {
  if (margen != null && (!Number.isFinite(margen) || margen < 5 || margen > 80)) throw new Error("El margen tiene que ir de 5 a 80");
  const r = await prisma.modelo.updateMany({ where: { tenantId, id: { in: modeloIds } }, data: { margen } });
  return r.count;
}
