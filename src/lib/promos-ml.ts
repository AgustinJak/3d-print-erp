import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getMlAccount, mlFetch } from "@/lib/mercadolibre";
import { cargarContextoDePrecios, preciosDeCombinaciones } from "@/lib/precios-combinacion";
import { margenDe, type GastosVenta } from "@/lib/precios-formula";
import type { LecturaMl } from "@/lib/precios-ml";
import { costosDeLectura, gastosConCostos } from "@/lib/precios-ml-publicacion";
import { tarifasGuardadas } from "@/lib/tarifas-ml";
import { cargoFijo, pctMasAlto } from "@/lib/tarifas-ml-reglas";
import {
  activaDe,
  avisosDe,
  candidatasDe,
  conPrecio,
  cuponesDe,
  normalizarCampana,
  normalizarPromo,
  pctDe,
  pedidoAMl,
  pendientesDe,
  precioParaPct,
  promoEsperada,
  quedo,
  quedoEnPromos,
  rangoDe,
  type AvisoDePromo,
  type CampanaMl,
  type PedidoDePromo,
  type PromoDePublicacion,
} from "@/lib/promos-ml-reglas";

/**
 * Las promos de Mercado Libre desde el ERP (docs/sdd/006, spec 010).
 *
 * - "Leer promos de ML" guarda, por publicación activa, en qué promo está y a cuáles se puede sumar
 *   (`promos_ml_lectura`). La pantalla trabaja sobre esa lectura.
 * - Prender, cambiar o sacar es siempre a pedido, con vista previa, y se vuelve a leer ML antes de
 *   mandar. Cada cambio queda en `cambios_promos`, salga bien o mal.
 *
 * Permiso: "Promociones, cupones y descuentos" en la app de ML (habilitado el 2026-10-30).
 */

const PROMO_GENERAL = 10;
const UMBRAL = 30000;
const EN_PARALELO = 10;

async function enTandas<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await f(xs[k]);
      }
    })
  );
  return out;
}

/** La promo general: la de la configuración del ERP si ya existe; si no, la decisión del 2026-10-28. */
async function promoGeneral(tenantId: string): Promise<number> {
  const cfg = await prisma.configPrecios.findUnique({ where: { tenantId } });
  const v = (cfg?.gastos as Record<string, unknown> | undefined)?.mlPromoPct;
  return typeof v === "number" ? v : PROMO_GENERAL;
}

export async function campanasDeMl(tenantId: string): Promise<CampanaMl[]> {
  const cuenta = await getMlAccount(tenantId);
  if (!cuenta) throw new Error("No hay una cuenta de Mercado Libre conectada.");
  const r = await mlFetch<{ results?: Record<string, unknown>[] }>(tenantId, `/seller-promotions/users/${cuenta.mlUserId}?app_version=v2`);
  return (r.results ?? []).map(normalizarCampana);
}

async function promosDeMl(tenantId: string, mla: string): Promise<PromoDePublicacion[]> {
  const r = await mlFetch<Record<string, unknown>[]>(tenantId, `/seller-promotions/items/${mla}?app_version=v2`);
  return (Array.isArray(r) ? r : []).map(normalizarPromo);
}

async function pagaHoy(tenantId: string, mla: string): Promise<number | null> {
  const r = await mlFetch<{ amount?: number }>(tenantId, `/items/${mla}/sale_price?context=channel_marketplace`).catch(() => null);
  return typeof r?.amount === "number" ? r.amount : null;
}

async function guardarLectura(tenantId: string, mla: string, promos: PromoDePublicacion[], error: string | null) {
  const data = { promos: promos as unknown as Prisma.InputJsonValue, error, leidoEn: new Date() };
  await prisma.promoMlLectura.upsert({ where: { tenantId_mla: { tenantId, mla } }, create: { tenantId, mla, ...data }, update: data });
}

/** Las publicaciones de ML del ERP que se miran: mapeadas, de Sendero y activas en la última lectura. */
async function publicaciones(tenantId: string) {
  const ms = await prisma.mapeoCanal.findMany({
    where: { tenantId, canal: "mercadolibre", ignorar: false, combinacionId: { not: null } },
    select: { clave: true, combinacionId: true, unidades: true, precioPublicado: true, precioLectura: true, combinacion: { select: { nombre: true } } },
  });
  const porMla = new Map<string, (typeof ms)[number]>();
  for (const m of ms) {
    const mla = m.clave.split("|")[0];
    const l = m.precioLectura as unknown as LecturaMl | null;
    if (l?.estado !== "active") continue;
    // Una publicación con variaciones tiene una fila por variación: la promo es de la publicación.
    if (!porMla.has(mla)) porMla.set(mla, m);
  }
  return porMla;
}

/**
 * "Leer promos de ML" (REQ-1, REQ-3): las publicaciones activas leídas antes de `desde` (todas si no
 * viene), hasta `limite`. Sólo GET.
 */
export async function leerPromos(
  tenantId: string,
  opts: { desde?: Date; limite?: number } = {}
): Promise<{ leidas: number; errores: Array<{ mla: string; error: string }>; faltan: number }> {
  const todas = [...(await publicaciones(tenantId)).keys()];
  // De a tandas, primero las nunca leídas y después las más viejas: leer las 186 de una tardaba
  // ~56 s, al borde del límite de una función. La pantalla pide tandas hasta que `faltan` es 0.
  const leidas = new Map((await prisma.promoMlLectura.findMany({ where: { tenantId }, select: { mla: true, leidoEn: true } })).map((l) => [l.mla, l.leidoEn.getTime()]));
  const desde = opts.desde?.getTime() ?? Infinity;
  const pendientes = todas.filter((m) => (leidas.get(m) ?? 0) < desde).sort((a, b) => (leidas.get(a) ?? 0) - (leidas.get(b) ?? 0));
  const pubs = pendientes.slice(0, opts.limite ?? pendientes.length);
  const errores: Array<{ mla: string; error: string }> = [];
  await enTandas(pubs, EN_PARALELO, async (mla) => {
    try {
      await guardarLectura(tenantId, mla, await promosDeMl(tenantId, mla), null);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      errores.push({ mla, error });
      await guardarLectura(tenantId, mla, [], error.slice(0, 500));
    }
  });
  return { leidas: pubs.length - errores.length, errores, faltan: pendientes.length - pubs.length };
}

export interface CandidataCalculada extends PromoDePublicacion {
  /** El descuento más chico que pide ML y el más grande que deja, en %. */
  pide: number | null;
  deja: number | null;
  /** El precio para la promo esperada (o el más cercano que ML deja). */
  propuesta: { precio: number | null; pct: number; ajustado: string | null };
  /** Lo que deja vendiendo a ese precio. */
  ganancia: number | null;
  margen: number | null;
}

export interface FilaPromo {
  mla: string;
  combinacionId: string;
  producto: string;
  unidades: number;
  /** El precio standard de la publicación (el que se publica). */
  publicado: number;
  /** Lo que paga el cliente hoy, según la última lectura de precios. */
  paga: number | null;
  /** La promo que supone el precio publicado (spec 003). */
  esperada: number;
  activa: (PromoDePublicacion & { pct: number }) | null;
  /** Lo que deja hoy, al precio de la promo activa (o al publicado sin promo). */
  ganancia: number | null;
  margen: number | null;
  cupones: PromoDePublicacion[];
  pendientes: PromoDePublicacion[];
  candidatas: CandidataCalculada[];
  avisos: AvisoDePromo[];
  leidoEn: string | null;
  error: string | null;
}

export interface CampanaResumen extends CampanaMl {
  /** Publicaciones del ERP que están adentro, y las que se pueden sumar. */
  adentro: number;
  aptas: number;
}

export interface ResumenPromos {
  leidoEn: string | null;
  promoGeneral: number;
  campanas: CampanaResumen[];
  filas: FilaPromo[];
  sinLeer: number;
}

/** Todo lo que muestra la pantalla, sobre la última lectura (REQ-1 a REQ-6). */
export async function resumenPromos(tenantId: string): Promise<ResumenPromos> {
  const [pubs, lecturas, campanas, general, cx, tarifas] = await Promise.all([
    publicaciones(tenantId),
    prisma.promoMlLectura.findMany({ where: { tenantId } }),
    campanasDeMl(tenantId).catch(() => [] as CampanaMl[]),
    promoGeneral(tenantId),
    cargarContextoDePrecios(tenantId),
    tarifasGuardadas(tenantId),
  ]);
  const combinaciones = new Map((await preciosDeCombinaciones(tenantId, {}, cx)).map((p) => [p.combinacionId, p]));
  const porMla = new Map(lecturas.map((l) => [l.mla, l]));

  const filas: FilaPromo[] = [];
  let sinLeer = 0;
  for (const [mla, m] of pubs) {
    const lect = porMla.get(mla);
    if (!lect) sinLeer++;
    const l = m.precioLectura as unknown as LecturaMl;
    const comb = combinaciones.get(m.combinacionId!);
    const publicado = m.precioPublicado ?? 0;
    const promos = ((lect?.promos ?? []) as unknown as PromoDePublicacion[]).map((p) => ({ ...p, original: p.original ?? publicado }));
    const politica = comb?.politica;
    const esperada = promoEsperada(publicado, politica?.propia ? politica.promo : general, UMBRAL);

    // Lo que deja a un precio, con lo que cobra ML por esta publicación.
    const g: GastosVenta | null = comb?.costo ? { ...cx.general.gastos } : null;
    const pctCat = (l.categoria ? tarifas?.categorias[l.categoria] : undefined) ?? pctMasAlto(tarifas) ?? cx.general.gastos.mlComisionPct;
    const costos = g ? costosDeLectura(l, mla, tarifas, g, pctCat) : null;
    const deja = (precio: number) => {
      if (!g || !costos || !comb?.costo) return { ganancia: null, margen: null };
      const fijo = tarifas?.fijos.length ? cargoFijo(tarifas, precio) : g.mlCargoFijo;
      const r = margenDe(gastosConCostos(g, costos, fijo), "ml", precio, comb.costo.fabricacion * m.unidades, comb.costo.insumos * m.unidades);
      return { ganancia: Math.round(r.ganancia), margen: Math.round(r.margen * 10) / 10 };
    };

    const activaCruda = activaDe(promos);
    const activa = activaCruda ? { ...activaCruda, pct: pctDe(activaCruda.precio!, activaCruda.original ?? publicado) } : null;
    const hoy = deja(activa?.precio ?? publicado);
    const objetivo = esperada || general;
    filas.push({
      mla,
      combinacionId: m.combinacionId!,
      producto: `${m.combinacion?.nombre ?? mla}${m.unidades > 1 ? ` ×${m.unidades}` : ""}`,
      unidades: m.unidades,
      publicado,
      paga: l.paga ?? null,
      esperada,
      activa,
      ...hoy,
      cupones: cuponesDe(promos),
      pendientes: pendientesDe(promos),
      candidatas: candidatasDe(promos).map((c) => {
        const propuesta = precioParaPct(c, publicado, objetivo);
        // En la co-participación lo que entra es el original menos la parte del vendedor: ML pone el resto.
        const cobra = c.pctVendedor != null ? Math.round(publicado * (1 - c.pctVendedor / 100)) : propuesta.precio ?? publicado;
        return { ...c, ...rangoDe(c, publicado), propuesta, ...deja(cobra) };
      }),
      avisos: lect && !lect.error ? avisosDe(esperada, activa, publicado) : [],
      leidoEn: lect?.leidoEn.toISOString() ?? null,
      error: lect?.error ?? null,
    });
  }

  const resumen: CampanaResumen[] = campanas
    .filter((c) => c.estado === "started" || c.estado === "pending")
    .map((c) => ({
      ...c,
      adentro: filas.filter((f) => f.activa?.id === c.id || f.cupones.some((x) => x.id === c.id) || f.pendientes.some((x) => x.id === c.id)).length,
      aptas: filas.filter((f) => f.candidatas.some((x) => x.id === c.id)).length,
    }));
  // El descuento propio no es una campaña de ML pero se ofrece igual.
  const propias = filas.filter((f) => f.candidatas.some((x) => x.tipo === "PRICE_DISCOUNT")).length;
  if (propias) {
    resumen.push({ id: "PRICE_DISCOUNT", tipo: "PRICE_DISCOUNT", subtipo: null, estado: "started", nombre: "Descuento propio", desde: null, hasta: null, pctFijo: null, adentro: filas.filter((f) => f.activa?.tipo === "PRICE_DISCOUNT").length, aptas: propias });
  }

  const fechas = lecturas.map((l) => l.leidoEn.getTime());
  return {
    leidoEn: fechas.length ? new Date(Math.min(...fechas)).toISOString() : null,
    promoGeneral: general,
    campanas: resumen,
    filas: filas.sort((a, b) => a.producto.localeCompare(b.producto, "es")),
    sinLeer,
  };
}

/* ───────────────────────── Cambios (REQ-4, REQ-7) ───────────────────────── */

export interface RevisionDePromo {
  pedido: PedidoDePromo;
  producto: string;
  /** Lo que paga el cliente ahora y con qué promo. */
  antes: { paga: number | null; promo: string | null; pct: number | null };
  /** Lo que pagaría. */
  despues: { paga: number | null; pct: number | null };
  errores: string[];
  avisos: string[];
}

export type ResultadoDePromo = RevisionDePromo & {
  estado: "aplicado" | "sin_efecto" | "rechazado" | "error";
  motivo: string | null;
};

/** Se lee ML de ahora y se revisa el pedido contra eso: lo de la pantalla puede estar viejo. */
async function revisar(tenantId: string, p: PedidoDePromo, general: number) {
  const [promos, paga, mapeo] = await Promise.all([
    promosDeMl(tenantId, p.mla),
    pagaHoy(tenantId, p.mla),
    prisma.mapeoCanal.findFirst({ where: { tenantId, canal: "mercadolibre", clave: { startsWith: `${p.mla}|` } }, select: { combinacionId: true, precioPublicado: true, combinacion: { select: { nombre: true } } } }),
  ]);
  const original = promos.find((x) => x.original)?.original ?? mapeo?.precioPublicado ?? 0;
  const activa = activaDe(promos);
  const errores: string[] = [];
  const avisos: string[] = [];
  let ofertaId: string | null = null;

  const mismo = (x: PromoDePublicacion) => x.tipo === p.promocionTipo && (p.promocionId == null || x.id === p.promocionId);
  if (p.accion === "sumar") {
    const c = promos.find((x) => x.estado === "candidate" && mismo(x));
    if (!c) errores.push("La publicación no es apta para esa campaña (o ya está adentro).");
    else {
      ofertaId = c.ofertaId;
      if (conPrecio(p.promocionTipo) && p.precio != null) {
        if (c.maximo != null && p.precio > c.maximo + 0.5) errores.push(`ML pide un precio de $${Math.floor(c.maximo).toLocaleString("es-AR")} o menos (${pctDe(c.maximo, original)} %).`);
        if (c.minimo != null && p.precio < c.minimo - 0.5) errores.push(`ML no deja bajar de $${Math.ceil(c.minimo).toLocaleString("es-AR")} (${pctDe(c.minimo, original)} %).`);
      }
    }
    if (activa && conPrecio(p.promocionTipo)) avisos.push(`Ya está en "${activa.nombre || activa.tipo}" a $${Math.round(activa.precio ?? 0).toLocaleString("es-AR")}: ML decide cuál gana.`);
  } else {
    const adentro = promos.find((x) => (x.estado === "started" || x.estado === "pending") && mismo(x));
    if (!adentro) errores.push("La publicación no está en esa campaña.");
  }
  const pct = p.precio != null && original ? pctDe(p.precio, original) : null;
  if (pct != null && pct > general + 0.5) avisos.push(`Es ${pct} %, más que el ${general} % que supone el precio publicado.`);

  const revision: RevisionDePromo = {
    pedido: p,
    producto: mapeo?.combinacion?.nombre ?? p.mla,
    antes: { paga, promo: activa ? activa.nombre || activa.tipo : null, pct: activa?.precio && original ? pctDe(activa.precio, original) : null },
    despues: { paga: p.accion === "sacar" ? original : p.precio ?? paga, pct: p.accion === "sacar" ? 0 : pct },
    errores,
    avisos,
  };
  return { revision, ofertaId, original, combinacionId: mapeo?.combinacionId ?? null };
}

/** La vista previa de varios cambios, sin tocar nada. */
export async function vistaPreviaPromos(tenantId: string, pedidos: PedidoDePromo[]): Promise<RevisionDePromo[]> {
  const general = await promoGeneral(tenantId);
  return enTandas(pedidos, EN_PARALELO, async (p) => (await revisar(tenantId, p, general)).revision);
}

/**
 * Aplica varios cambios, uno por uno: se revisa contra ML de ahora, se manda, se verifica con lo
 * que paga el cliente y se registra, salga bien o mal. Después se vuelve a leer la publicación.
 */
export async function aplicarPromos(tenantId: string, pedidos: PedidoDePromo[], usuario: string | null): Promise<ResultadoDePromo[]> {
  const general = await promoGeneral(tenantId);
  return enTandas(pedidos, 4, async (p): Promise<ResultadoDePromo> => {
    const { revision, ofertaId, original, combinacionId } = await revisar(tenantId, p, general);
    let estado: ResultadoDePromo["estado"] = "aplicado";
    let motivo: string | null = null;
    let respuesta: unknown = null;
    let pagaDespues: number | null = null;
    let promosDespues: PromoDePublicacion[] | null = null;

    const envio = pedidoAMl(p, ofertaId);
    if (revision.errores.length || "error" in envio) {
      estado = "rechazado";
      motivo = [...revision.errores, "error" in envio ? envio.error : ""].filter(Boolean).join(" ");
    } else {
      try {
        respuesta = await mlFetch(tenantId, envio.path, {
          method: envio.metodo,
          headers: envio.cuerpo ? { "Content-Type": "application/json" } : undefined,
          body: envio.cuerpo ? JSON.stringify(envio.cuerpo) : undefined,
        });
        const [paga, despues] = await Promise.all([pagaHoy(tenantId, p.mla), promosDeMl(tenantId, p.mla).catch(() => null)]);
        pagaDespues = paga;
        promosDespues = despues;
        // Sumar a una campaña con el mismo precio que ya pagaba no cambia lo que paga el cliente:
        // ahí manda la lista de promos. Cambiar o sacar se ve en el precio aunque la lista tarde.
        const enLista = despues ? quedoEnPromos(p, despues) : false;
        const enPrecio = quedo(p, pagaDespues, original);
        const ok = p.accion === "sumar" ? enLista || (enPrecio && revision.antes.paga !== pagaDespues) : enPrecio || enLista;
        if (!ok) {
          estado = "sin_efecto";
          motivo = `ML contestó bien pero no aparece el cambio: el cliente paga ${pagaDespues == null ? "?" : Math.round(pagaDespues).toLocaleString("es-AR")}.`;
        }
      } catch (e) {
        estado = "error";
        motivo = e instanceof Error ? e.message : String(e);
        respuesta = { error: motivo };
      }
    }

    await prisma.cambioPromo.create({
      data: {
        tenantId,
        mla: p.mla,
        combinacionId,
        accion: p.accion,
        promocionId: p.promocionId,
        promocionTipo: p.promocionTipo,
        antes: revision.antes as unknown as Prisma.InputJsonValue,
        despues: { ...revision.despues, pagaVerificado: pagaDespues } as unknown as Prisma.InputJsonValue,
        estado,
        respuesta: (respuesta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        usuario,
      },
    });
    if (estado !== "rechazado") {
      await (promosDespues ? Promise.resolve(promosDespues) : promosDeMl(tenantId, p.mla))
        .then((ps) => guardarLectura(tenantId, p.mla, ps, null))
        .catch(() => undefined);
    }
    return { ...revision, despues: { ...revision.despues, paga: pagaDespues ?? revision.despues.paga }, estado, motivo };
  });
}

export interface CambioDePromoRegistrado {
  id: string;
  mla: string;
  producto: string | null;
  accion: string;
  promocionId: string | null;
  promocionTipo: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  estado: string;
  usuario: string | null;
  creadoEn: string;
}

export async function historialPromos(tenantId: string, limite = 200): Promise<CambioDePromoRegistrado[]> {
  const filas = await prisma.cambioPromo.findMany({ where: { tenantId }, orderBy: { creadoEn: "desc" }, take: limite });
  const nombres = new Map(
    (await prisma.combinacion.findMany({ where: { id: { in: filas.map((f) => f.combinacionId).filter((x): x is string => !!x) } }, select: { id: true, nombre: true } })).map((c) => [c.id, c.nombre])
  );
  return filas.map((f) => ({
    id: f.id,
    mla: f.mla,
    producto: f.combinacionId ? nombres.get(f.combinacionId) ?? null : null,
    accion: f.accion,
    promocionId: f.promocionId,
    promocionTipo: f.promocionTipo,
    antes: f.antes as Record<string, unknown> | null,
    despues: f.despues as Record<string, unknown> | null,
    estado: f.estado,
    usuario: f.usuario,
    creadoEn: f.creadoEn.toISOString(),
  }));
}
