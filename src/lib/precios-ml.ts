import { prisma } from "@/lib/prisma";
import { getMlAccount, mlFetch } from "@/lib/mercadolibre";
import { actualizarTarifas } from "@/lib/tarifas-ml";

/**
 * Precios en Mercado Libre (docs/sdd/003, spec 005): leer lo publicado, decidir si se puede tocar
 * y escribir sólo el precio.
 *
 * Hasta acá la integración era de sólo lectura; esta es la única escritura, y sólo la dispara
 * "Aplicar" en la pantalla de Precios. Lo que se verificó en la documentación vigente
 * (2026-10-24):
 *
 * - El precio se sigue escribiendo con `PUT /items/{id}` y `{ price }`. El recurso nuevo
 *   (`POST /items/{id}/prices/standard`) "aún no está disponible".
 * - El cambio del 2026-03-18 rechaza ese PUT **sólo en publicaciones con automatización de
 *   precios** (400 `item.price.not_modifiable`). Se averigua con
 *   `GET /pricing-automation/users/{id}/items`; hoy la cuenta no tiene ninguna.
 * - ML va a sacar `price` de `/items`: el precio se lee de `/items/{id}/prices` (el standard, el
 *   que pone el vendedor) y lo que paga el cliente de `/items/{id}/sale_price`.
 * - En una campaña del vendedor el precio cambia, pero el cliente sigue pagando el de la oferta
 *   hasta que la campaña termina o se saca la publicación (Agustín, 2026-10-24; probado con el
 *   Carrete: a $3.900 siguió pagando $3.610). Bajar el precio por debajo de la oferta la elimina,
 *   y hasta el 2026-10-30 la app no podía volver a meterla (403). Con el permiso de promociones
 *   ya puede (docs/sdd/006, spec 010).
 */

export interface LecturaMl {
  estado: string;
  subEstado: string[];
  /** Lo que paga el cliente hoy: el de la promoción si hay una. */
  paga: number | null;
  /** `fin`: hasta cuándo el cliente paga el precio de la oferta (null si ML no lo dice). */
  promo: { id: string; tipo: string | null; campania: string | null; fin: string | null } | null;
  /** null = no se pudo averiguar, y entonces no se escribe. */
  automatizada: boolean | null;
  variaciones: number;
  catalogo: boolean;
  /**
   * Lo que define cuánto cobra ML por esta publicación (docs/sdd/006, spec 003). Opcionales: las
   * lecturas de antes de la 006 no los tienen.
   */
  tipo?: string | null;
  categoria?: string | null;
  envioGratis?: boolean;
  /**
   * Lo que le cuesta (o le costaría, si no lo tiene) al vendedor el envío gratis de esta
   * publicación, según su peso. ML lo cotiza con `free_shipping=true` aunque no esté activado.
   */
  costoEnvio?: number | null;
  /** `INSTALLMENTS_CAMPAIGN` de ML: "3x_campaign" = 3 cuotas sin interés. */
  campaniaCuotas?: string | null;
}

interface ItemMl {
  id: string;
  status: string;
  sub_status?: string[];
  price?: number;
  catalog_listing?: boolean;
  variations?: Array<{ id: number; price: number }>;
  listing_type_id?: string;
  category_id?: string;
  shipping?: { free_shipping?: boolean };
  sale_terms?: Array<{ id: string; value_name: string | null }>;
}

interface PreciosMl {
  prices?: Array<{ type: string; amount: number; conditions?: { context_restrictions?: string[]; end_time?: string | null } }>;
}

interface SalePriceMl {
  amount: number;
  metadata?: { promotion_id?: string; promotion_type?: string; campaign_id?: string };
}

export const LECTURA_VIGENTE_MS = 60 * 60 * 1000;
const PAUSA_ENTRE_ESCRITURAS_MS = 1500;

const mlaDe = (clave: string) => clave.split("|")[0];

/** Los ids de las publicaciones con automatización de precios; null si la API no contesta. */
async function automatizadas(tenantId: string): Promise<Set<string> | null> {
  const cuenta = await getMlAccount(tenantId);
  if (!cuenta) return null;
  const ids = new Set<string>();
  try {
    for (let offset = 0; ; offset += 100) {
      const r = await mlFetch<{ items: string[]; paging: { total: number } }>(
        tenantId,
        `/pricing-automation/users/${cuenta.mlUserId}/items?offset=${offset}&limit=100`
      );
      r.items.forEach((i) => ids.add(i));
      if (offset + 100 >= r.paging.total) return ids;
    }
  } catch {
    return null;
  }
}

const delMarketplace = (p: NonNullable<PreciosMl["prices"]>[number]) =>
  !p.conditions?.context_restrictions?.length || p.conditions.context_restrictions.includes("channel_marketplace");

/** El precio standard (el que puso el vendedor y el que cambia el ERP) y las promociones vigentes. */
async function preciosDe(tenantId: string, mla: string): Promise<{ standard: number | null; promos: NonNullable<PreciosMl["prices"]> }> {
  const r = await mlFetch<PreciosMl>(tenantId, `/items/${mla}/prices`);
  const std = r.prices?.find((p) => p.type === "standard" && delMarketplace(p));
  return { standard: std ? std.amount : null, promos: (r.prices ?? []).filter((p) => p.type === "promotion" && delMarketplace(p)) };
}

const precioStandard = async (tenantId: string, mla: string) => (await preciosDe(tenantId, mla)).standard;

async function enTandas<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(f))));
  return out;
}

/**
 * Lee el precio de todas las publicaciones de ML del mapeo (sin las de Shay) y lo guarda en
 * `mapeos_canal`. Sólo `GET`.
 */
export async function leerPreciosMl(tenantId: string): Promise<{ leidas: number; errores: Array<{ mla: string; error: string }> }> {
  const mapeos = await prisma.mapeoCanal.findMany({
    where: { tenantId, canal: "mercadolibre", ignorar: false },
    select: { id: true, clave: true },
  });
  const ids = [...new Set(mapeos.map((m) => mlaDe(m.clave)))];
  const auto = await automatizadas(tenantId);

  const items = new Map<string, ItemMl>();
  for (let i = 0; i < ids.length; i += 20) {
    const r = await mlFetch<Array<{ code: number; body: ItemMl }>>(
      tenantId,
      `/items?ids=${ids.slice(i, i + 20).join(",")}&attributes=id,status,sub_status,price,catalog_listing,variations,listing_type_id,category_id,shipping,sale_terms`
    );
    for (const x of r) if (x.code === 200) items.set(x.body.id, x.body);
  }

  const cuenta = await getMlAccount(tenantId);
  const errores: Array<{ mla: string; error: string }> = [];
  const leidas = await enTandas(ids, 10, async (mla) => {
    const item = items.get(mla);
    if (!item) {
      errores.push({ mla, error: "ML no devolvió la publicación" });
      return null;
    }
    try {
      const envioGratis = !!item.shipping?.free_shipping;
      const [{ standard, promos }, venta, envio] = await Promise.all([
        preciosDe(tenantId, mla),
        mlFetch<SalePriceMl>(tenantId, `/items/${mla}/sale_price?context=channel_marketplace`).catch(() => null),
        // Lo que cuesta, o costaría, el envío gratis: una llamada por publicación. Para la opción 2
        // de un producto que hoy no tiene envío gratis (spec 006).
        cuenta
          ? mlFetch<{ coverage?: { all_country?: { list_cost?: number } } }>(tenantId, `/users/${cuenta.mlUserId}/shipping_options/free?item_id=${mla}&free_shipping=true`).catch(() => null)
          : Promise.resolve(null),
      ]);
      // La promoción que gana es la del precio que paga el cliente.
      const ganadora = promos.find((p) => venta && Math.abs(p.amount - venta.amount) < 0.01) ?? promos[0];
      const promo = venta?.metadata?.promotion_id
        ? {
            id: venta.metadata.promotion_id,
            tipo: venta.metadata.promotion_type ?? null,
            campania: venta.metadata.campaign_id ?? null,
            fin: ganadora?.conditions?.end_time ?? null,
          }
        : null;
      const lectura: LecturaMl = {
        estado: item.status,
        subEstado: item.sub_status ?? [],
        paga: venta?.amount ?? null,
        promo,
        automatizada: auto ? auto.has(mla) : null,
        variaciones: item.variations?.length ?? 0,
        catalogo: !!item.catalog_listing,
        tipo: item.listing_type_id ?? null,
        categoria: item.category_id ?? null,
        envioGratis,
        costoEnvio: envio?.coverage?.all_country?.list_cost ?? null,
        campaniaCuotas: item.sale_terms?.find((t) => t.id === "INSTALLMENTS_CAMPAIGN")?.value_name ?? null,
      };
      return { mla, precio: standard ?? item.price ?? null, lectura };
    } catch (e) {
      errores.push({ mla, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  });

  // Todo en un UPDATE: de a uno eran cien idas y vueltas a la base.
  const porMla = new Map(leidas.filter((x) => x).map((x) => [x!.mla, x!]));
  const filas = mapeos
    .filter((m) => porMla.has(mlaDe(m.clave)))
    .map((m) => ({ id: m.id, precio: porMla.get(mlaDe(m.clave))!.precio, lectura: porMla.get(mlaDe(m.clave))!.lectura }));
  if (filas.length) {
    await prisma.$executeRaw`
      UPDATE mapeos_canal AS m
         SET precio_publicado = x.precio, precio_leido_en = now(), precio_lectura = x.lectura
        FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) AS x(id text, precio double precision, lectura jsonb)
       WHERE m.id = x.id AND m.tenant_id = ${tenantId}`;
  }
  // Las tarifas de las categorías leídas (comisión, cargo fijo, recargo por cuotas), la más usada
  // primero: con ella se buscan los tramos del cargo fijo.
  const usos = new Map<string, number>();
  for (const x of porMla.values()) if (x.lectura.categoria) usos.set(x.lectura.categoria, (usos.get(x.lectura.categoria) ?? 0) + 1);
  await actualizarTarifas(tenantId, [...usos].sort((a, b) => b[1] - a[1]).map(([c]) => c)).catch((e) =>
    errores.push({ mla: "tarifas", error: e instanceof Error ? e.message : String(e) })
  );
  return { leidas: porMla.size, errores };
}

/** Por qué no se puede escribir el precio de una publicación; null = se puede (RN-3). */
export function motivoMl(lectura: LecturaMl | null, leidoEn: Date | null, ahora = Date.now()): string | null {
  if (!lectura || !leidoEn) return "sin leer: tocá «Leer precios de ML»";
  if (ahora - leidoEn.getTime() > LECTURA_VIGENTE_MS) return "lectura de más de una hora: volvé a leer";
  if (lectura.estado === "closed" || lectura.estado === "inactive") return "publicación cerrada";
  if (lectura.estado === "under_review" || lectura.subEstado.some((s) => /review|waiting_for_patch/.test(s))) return "publicación en revisión";
  if (lectura.automatizada === null) return "no se pudo verificar la automatización de precios";
  if (lectura.automatizada) return "tiene automatización de precios: ML no deja cambiarlo";
  // Mandar `variations` en el PUT borra las que no van: no se escribe hasta tener una de prueba.
  if (lectura.variaciones > 0) return "publicación con variaciones: todavía no se escribe";
  return null;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

/**
 * Lo que hay que saber antes de aplicar en una publicación en campaña. `sacaPromo` = el precio
 * nuevo queda por debajo del de la oferta: ML la elimina y el ERP no la puede volver a poner, así
 * que pide la confirmación aparte.
 */
export function avisoMl(lectura: LecturaMl | null, propuesto: number | null): { aviso: string; sacaPromo: boolean } | null {
  if (!lectura?.promo || propuesto == null) return null;
  const hasta = lectura.promo.fin ? ` hasta el ${fecha(lectura.promo.fin)}` : " hasta que termine la campaña";
  const paga = lectura.paga ?? 0;
  if (propuesto < paga) {
    return { aviso: `queda por debajo del precio de campaña ($${Math.round(paga).toLocaleString("es-AR")}): ML saca la promoción`, sacaPromo: true };
  }
  return { aviso: `en campaña: el cliente sigue pagando $${Math.round(paga).toLocaleString("es-AR")}${hasta}`, sacaPromo: false };
}

/**
 * Campos que cambian solos y no cuentan como "tocados" por el ERP: una venta, el reloj, o ML
 * recalculando la publicación al recibir cualquier PUT. En la prueba del 2026-10-24 ML renovó el
 * vencimiento (`expiration_time`) y movió etiquetas (`tags`) con un PUT que sólo llevaba `price`.
 */
const VOLATILES = new Set([
  "price",
  "base_price",
  "original_price",
  "last_updated",
  "sold_quantity",
  "available_quantity",
  "initial_quantity",
  "health",
  "stop_time",
  "end_time",
  "expiration_time",
  "tags",
]);

interface EnvioMl {
  free_shipping?: boolean;
  tags?: string[];
}

export interface EscrituraMl {
  antes: number | null;
  despues: number | null;
  /**
   * Campos de la publicación que cambiaron además del precio. Tiene que estar vacía (CA-4): el ERP
   * manda sólo `{ price }`, así que algo acá es ML haciendo algo que no se esperaba.
   */
  otrosCambios: string[];
  /**
   * El envío gratis lo decide ML por el precio: arriba de su umbral es obligatorio. Bajar de
   * $43.000 a $32.541 se lo sacó y volver a $43.000 se lo puso ("Mandatory free shipping added").
   * No lo toca el ERP, pero cambia lo que ve el comprador, así que se informa aparte.
   */
  envioGratis: { antes: boolean; despues: boolean } | null;
  advertencias: unknown[];
}

/**
 * Escribe el precio de una publicación sin variaciones. Lee la publicación entera antes y
 * después para comprobar que no cambió nada más (CA-4). Quien llama ya chequeó `motivoMl`.
 */
export async function escribirPrecioMl(tenantId: string, mla: string, precio: number): Promise<EscrituraMl> {
  if (!Number.isFinite(precio) || precio <= 0) throw new Error(`precio inválido: ${precio}`);
  const [itemAntes, antes] = await Promise.all([
    mlFetch<Record<string, unknown>>(tenantId, `/items/${mla}`),
    precioStandard(tenantId, mla),
  ]);
  if (Array.isArray(itemAntes.variations) && itemAntes.variations.length) throw new Error("la publicación tiene variaciones");

  const r = await mlFetch<{ warnings?: unknown[] }>(tenantId, `/items/${mla}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: Math.round(precio) }),
  });

  const [itemDespues, despues] = await Promise.all([
    mlFetch<Record<string, unknown>>(tenantId, `/items/${mla}`),
    precioStandard(tenantId, mla),
  ]);
  const claves = new Set([...Object.keys(itemAntes), ...Object.keys(itemDespues)]);
  const distintos = [...claves].filter((k) => !VOLATILES.has(k) && JSON.stringify(itemAntes[k]) !== JSON.stringify(itemDespues[k]));

  // Del envío, lo que deriva ML del precio (envío gratis y su etiqueta de obligatorio) no cuenta
  // como otro cambio; si cambió algo más del envío, sí.
  const envio = (x: unknown) => (x ?? {}) as EnvioMl & Record<string, unknown>;
  const sinDerivado = (x: unknown) => JSON.stringify({ ...envio(x), free_shipping: undefined, tags: undefined });
  const otrosCambios = distintos.filter((k) => k !== "shipping" || sinDerivado(itemAntes.shipping) !== sinDerivado(itemDespues.shipping));
  const gratis = (x: unknown) => !!envio(x).free_shipping;
  const envioGratis = gratis(itemAntes.shipping) !== gratis(itemDespues.shipping) ? { antes: gratis(itemAntes.shipping), despues: gratis(itemDespues.shipping) } : null;
  return { antes, despues, otrosCambios, envioGratis, advertencias: r.warnings ?? [] };
}

export const pausaEntreEscrituras = () => new Promise((r) => setTimeout(r, PAUSA_ENTRE_ESCRITURAS_MS));

/** Un error de autorización corta todo lo que falta (RN-5). */
export const esErrorDeAutorizacion = (e: unknown) => /ML API (401|403)\b/.test(e instanceof Error ? e.message : String(e));
