import type { Prisma, PrismaClient } from "@/generated/prisma";
import { costoModelo, costoVariante } from "@/lib/costos";
import { asegurarCombinacion } from "@/lib/combinaciones";
import { ESTADOS_QUE_RESERVAN } from "@/lib/reservas";
import { normalizeForMatch } from "@/lib/webhook-security";

/**
 * Mapeo por canal: qué combinación es cada cosa que vende un canal (docs/sdd/001,
 * spec 004).
 *
 * Cada canal identifica lo que vendió con su propia clave (la publicación y la
 * variación de ML, el producto y las opciones del Shop). Esa clave se mapea una
 * vez a una combinación vendible y a partir de ahí la venta no depende de cómo
 * se escriban los nombres. Lo que no está mapeado se intenta resolver con la
 * lógica de antes; si resuelve sin dudas, queda mapeado solo, y si no, la clave
 * espera en una cola en Integraciones › Mapeo.
 *
 * Las funciones de arriba son puras: las prueban los scripts sin base.
 */

export type Canal = "mercadolibre" | "shop";
export const CANALES: Canal[] = ["mercadolibre", "shop"];

/** `<MLA>|<variation_id>`, vacío después de la barra si la publicación no tiene variaciones. */
export function claveMl(mla: string, variationId?: number | string | null): string {
  return `${mla.trim()}|${variationId ?? ""}`;
}

/** Un valor de opción del Shop tal como entra en la clave transitoria. */
const valorDeClave = (s: string) => normalizeForMatch(s).replace(/,/g, " ");

/**
 * La clave de una línea del Shop.
 *
 * Por ids (`<producto_id>|<opcion_ids ordenados>`) cuando el Shop los manda (spec
 * 005). Mientras no los mande, la transitoria: `sku:<SKU>|<valores normalizados y
 * ordenados>`, o `nombre:<producto>|…` si la línea no trae SKU.
 */
export function claveShop(linea: {
  productoId?: string | null;
  sku?: string | null;
  nombre: string;
  opciones: Array<{ opcionId?: string | null; nombre: string }>;
}): string {
  const conIds = linea.productoId && linea.opciones.every((o) => o.opcionId);
  if (conIds) {
    const ids = [...new Set(linea.opciones.map((o) => o.opcionId!.trim()))].sort();
    return `${linea.productoId!.trim()}|${ids.join(",")}`;
  }
  const base = linea.sku?.trim() ? `sku:${linea.sku.trim().toUpperCase()}` : `nombre:${valorDeClave(linea.nombre)}`;
  const valores = linea.opciones.map((o) => valorDeClave(o.nombre)).filter(Boolean).sort();
  return `${base}|${valores.join(",")}`;
}

/**
 * Un "pack de 10" vendido una vez son 10 unidades de la combinación (spec 004,
 * RN-2). El total de la línea no cambia: sólo cómo se reparte.
 */
export function aplicarUnidades(
  cantidad: number,
  precioUnitario: number,
  unidades: number
): { cantidad: number; precioUnitario: number } {
  const u = Number.isInteger(unidades) && unidades > 1 ? unidades : 1;
  if (u === 1) return { cantidad, precioUnitario };
  return { cantidad: cantidad * u, precioUnitario: Math.round((precioUnitario / u) * 100) / 100 };
}

/* ─────────────────────────────── con base ─────────────────────────────── */

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Lo que dedujo la lógica de antes (por nombres) para una clave que no está
 * mapeada. `sinDudas` sigue la regla estricta de la spec 004, RN-4: si es false,
 * la clave va a la cola aunque haya un modelo.
 */
export type Sugerencia =
  | { ignorar: true }
  | { ignorar?: false; modeloId: string; variantes: string[]; sinDudas: boolean };

export interface CombinacionResuelta {
  id: string;
  modeloId: string;
  variantes: string[];
  nombre: string;
  sku: string | null;
}

export type Resolucion =
  | { tipo: "ignorar"; mapeoId: string }
  | {
      tipo: "combinacion";
      mapeoId: string;
      combinacion: CombinacionResuelta;
      unidades: number;
      origen: string;
      nuevo: boolean;
      /** Líneas abiertas que esperaban esta clave en la cola y se completaron ahora. */
      completadas?: number;
    }
  | { tipo: "cola"; mapeoId: string };

const SELECT_COMBINACION = { id: true, modeloId: true, variantes: true, nombre: true, sku: true, activo: true } as const;

/**
 * Una combinación sirve para resolver una venta si está activa. Una desactivada
 * es historia: la variante se borró, o "el modelo solo" dejó de venderse porque
 * ahora cada venta tiene que decir con o sin funda.
 */
async function combinacionUsable(db: Db, tenantId: string, id: string | null) {
  if (!id) return null;
  const c = await db.combinacion.findFirst({ where: { id, tenantId }, select: SELECT_COMBINACION });
  return c?.activo ? c : null;
}

/**
 * Resuelve una línea de un canal por su clave (spec 004, REQ-2 y REQ-3).
 *
 * 1. Si la clave está mapeada a una combinación activa, o marcada como otro
 *    negocio, eso manda, sin mirar nombres.
 * 2. Si no, se usa la `sugerencia` (la lógica de antes): sin dudas, se crea o se
 *    completa el mapeo como automático; con dudas, la clave queda en la cola.
 *
 * Un mapeo manual nunca lo pisa la sugerencia (RN-6). Cada llamada cuenta una
 * venta en la clave y guarda lo último que mandó el canal, para la pantalla.
 */
export async function resolverLinea(
  db: Db,
  tenantId: string,
  canal: Canal,
  clave: string,
  opts: {
    sugerencia: Sugerencia | null;
    descripcion?: string | null;
    muestra?: Prisma.InputJsonValue;
    /** El pedido que trajo esta venta (pack de ML, número del Shop). */
    venta?: string | null;
    /** La siembra registra la clave sin contarla como venta. */
    contar?: boolean;
    origen?: "siembra" | "auto";
  }
): Promise<Resolucion> {
  const contar = opts.contar ?? true;
  const origenNuevo = opts.origen ?? "auto";
  const visto = {
    ...(opts.descripcion ? { descripcion: opts.descripcion } : {}),
    ...(opts.muestra !== undefined ? { muestra: opts.muestra } : {}),
    ...(contar ? { vecesVista: { increment: 1 }, ...(opts.venta ? { ultimaVenta: opts.venta } : {}) } : {}),
  };

  const existente = await db.mapeoCanal.findUnique({
    where: { tenantId_canal_clave: { tenantId, canal, clave } },
  });

  if (existente) {
    if (Object.keys(visto).length > 0) {
      await db.mapeoCanal.update({ where: { id: existente.id }, data: visto });
    }
    if (existente.ignorar) return { tipo: "ignorar", mapeoId: existente.id };

    const c = await combinacionUsable(db, tenantId, existente.combinacionId);
    if (c) {
      return {
        tipo: "combinacion",
        mapeoId: existente.id,
        combinacion: c,
        unidades: existente.unidades,
        origen: existente.origen,
        nuevo: false,
      };
    }
    // En la cola, o apuntando a una combinación que ya no se vende. Si nadie lo
    // tocó a mano, se vuelve a intentar: puede que el catálogo ya esté completo.
    if (existente.origen !== "manual") {
      const r = await aplicarSugerencia(db, tenantId, opts.sugerencia);
      if (r === "ignorar") {
        await db.mapeoCanal.update({ where: { id: existente.id }, data: { ignorar: true, combinacionId: null } });
        return { tipo: "ignorar", mapeoId: existente.id };
      }
      if (r) {
        await db.mapeoCanal.update({ where: { id: existente.id }, data: { combinacionId: r.id } });
        // Las líneas abiertas que esperaban esta clave también se completan; el
        // reparto lo corre quien llama, como después de cualquier venta.
        const completadas = await completarLineasDeClave(db, tenantId, canal, clave, r, existente.unidades);
        return { tipo: "combinacion", mapeoId: existente.id, combinacion: r, unidades: existente.unidades, origen: existente.origen, nuevo: false, completadas };
      }
    }
    return { tipo: "cola", mapeoId: existente.id };
  }

  const r = await aplicarSugerencia(db, tenantId, opts.sugerencia);
  // upsert y no create: dos webhooks con la misma clave pueden llegar juntos.
  const creado = await db.mapeoCanal.upsert({
    where: { tenantId_canal_clave: { tenantId, canal, clave } },
    create: {
      tenantId,
      canal,
      clave,
      combinacionId: r && r !== "ignorar" ? r.id : null,
      ignorar: r === "ignorar",
      origen: origenNuevo,
      descripcion: opts.descripcion ?? null,
      muestra: opts.muestra,
      vecesVista: contar ? 1 : 0,
      ultimaVenta: contar ? (opts.venta ?? null) : null,
    },
    update: visto,
  });
  if (creado.ignorar) return { tipo: "ignorar", mapeoId: creado.id };
  if (r && r !== "ignorar" && creado.combinacionId === r.id) {
    return { tipo: "combinacion", mapeoId: creado.id, combinacion: r, unidades: creado.unidades, origen: creado.origen, nuevo: true };
  }
  return { tipo: "cola", mapeoId: creado.id };
}

/** La combinación que corresponde a una sugerencia sin dudas, creándola si falta. */
async function aplicarSugerencia(
  db: Db,
  tenantId: string,
  s: Sugerencia | null
): Promise<CombinacionResuelta | "ignorar" | null> {
  if (!s) return null;
  if (s.ignorar) return "ignorar";
  if (!s.sinDudas) return null;
  if (await esAmbigua(db, tenantId, s.modeloId, s.variantes)) return null;
  try {
    const { id } = await asegurarCombinacion(db, tenantId, s.modeloId, s.variantes);
    return await combinacionUsable(db, tenantId, id);
  } catch {
    // Una variante que no es del modelo, o un modelo de otro tenant: a la cola.
    return null;
  }
}

/**
 * "El modelo solo" de un modelo que tiene variantes no dice cuál se vendió (una
 * katana sin decir si lleva funda): no se crea ni se usa, va a la cola.
 */
export async function esAmbigua(db: Db, tenantId: string, modeloId: string, variantes: string[]): Promise<boolean> {
  if (variantes.length > 0) return false;
  const n = await db.varianteModelo.count({ where: { modeloId, activo: true, modelo: { tenantId } } });
  return n > 0;
}

/** Una opción o atributo que mandó el canal, con lo que conviene guardar de ella. */
export interface OpcionDelCanal {
  nombre: string;
  /** `mlAtributo`, `shopGrupo`, `precioExtra`…: se guardan tal cual en `variantesInfo`. */
  extra?: Record<string, unknown>;
}

export interface LineaDeCombinacion {
  modeloId: string;
  combinacionId: string;
  costoUnitario: number;
  variantesInfo: Prisma.InputJsonValue;
}

/**
 * Los datos de una línea de pedido que sale de una combinación mapeada.
 *
 * `variantesInfo` lleva las variantes de la combinación con `matched: true` (lo
 * que lee el reparto si alguna vez falta la combinación) y, como registro, lo que
 * mandó el canal que no es una variante: el color de una publicación, el tamaño
 * que ya es el modelo.
 */
export async function lineaDeCombinacion(
  db: Db,
  tenantId: string,
  combinacion: { id: string; modeloId: string; variantes: string[] },
  opciones: OpcionDelCanal[],
  origen = "mapeo"
): Promise<LineaDeCombinacion> {
  const modelo = await db.modelo.findFirst({
    where: { id: combinacion.modeloId, tenantId },
    select: {
      costoFab: true,
      costoInsumos: true,
      variantes: {
        where: { id: { in: combinacion.variantes } },
        select: { id: true, nombre: true, precioAdicional: true, costoFabAdicional: true, costoInsumosAdicional: true },
      },
    },
  });
  if (!modelo) throw new Error(`la combinación ${combinacion.id} apunta a un modelo que no existe`);

  const usadas = new Set<number>();
  const info: Array<Record<string, unknown>> = [];
  let costo = costoModelo(modelo);

  for (const v of modelo.variantes) {
    costo += costoVariante(v);
    // Si el canal la nombró, se guarda con lo que dijo el canal (grupo, atributo).
    const i = opciones.findIndex((o, k) => !usadas.has(k) && normalizeForMatch(o.nombre) === normalizeForMatch(v.nombre));
    if (i >= 0) usadas.add(i);
    info.push({
      ...(i >= 0 ? opciones[i].extra : {}),
      nombre: v.nombre,
      matched: true,
      varianteId: v.id,
      precioAdicional: v.precioAdicional,
      costoFabAdicional: v.costoFabAdicional,
      origen,
    });
  }
  opciones.forEach((o, k) => {
    if (!usadas.has(k)) info.push({ ...o.extra, nombre: o.nombre, matched: false });
  });

  return {
    modeloId: combinacion.modeloId,
    combinacionId: combinacion.id,
    costoUnitario: costo,
    variantesInfo: info as unknown as Prisma.InputJsonValue,
  };
}

/** Lo que una entrada de `variantesInfo` sabe de la variante, no del canal: se recalcula. */
const DE_LA_VARIANTE = new Set([
  "nombre",
  "matched",
  "varianteId",
  "costoFabAdicional",
  "precioAdicional",
  "origen",
  "absorbidaEnElModelo",
]);

/**
 * Al mapear una clave de la cola, las líneas de pedidos abiertos que entraron con
 * esa clave y sin combinación la toman (spec 004, REQ-5): modelo, costo,
 * variantes y unidades. Las de pedidos cerrados no se tocan: son lo que se vendió
 * y se cobró. Devuelve cuántas líneas cambió; el reparto lo corre quien llama.
 */
export async function completarLineasDeClave(
  db: Db,
  tenantId: string,
  canal: Canal,
  clave: string,
  combinacion: { id: string; modeloId: string; variantes: string[] },
  unidades: number
): Promise<number> {
  const lineas = await db.itemPedido.findMany({
    where: {
      claveCanal: clave,
      combinacionId: null,
      pedido: { tenantId, canalVenta: canal, estado: { in: [...ESTADOS_QUE_RESERVAN] } },
    },
    select: { id: true, cantidad: true, precioUnitario: true, variantesInfo: true },
  });

  for (const l of lineas) {
    const previas = Array.isArray(l.variantesInfo) ? (l.variantesInfo as Array<Record<string, unknown>>) : [];
    // Lo que el canal mandó se vuelve a cruzar contra las variantes de la combinación.
    const opciones: OpcionDelCanal[] = previas
      .filter((e) => e && typeof e.nombre === "string")
      .map((e) => ({
        nombre: e.nombre as string,
        extra: Object.fromEntries(Object.entries(e).filter(([k]) => !DE_LA_VARIANTE.has(k))),
      }));
    const datos = await lineaDeCombinacion(db, tenantId, combinacion, opciones, "mapeo_cola");
    const { cantidad, precioUnitario } = aplicarUnidades(l.cantidad, l.precioUnitario, unidades);
    await db.itemPedido.update({
      where: { id: l.id },
      data: { ...datos, cantidad, precioUnitario },
    });
  }
  return lineas.length;
}

export class ErrorDeMapeo extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface CambiosDeMapeo {
  combinacionId?: string | null;
  unidades?: number;
  ignorar?: boolean;
}

/**
 * Mapea una clave a mano (spec 004, REQ-4 y REQ-5). Desde acá queda `manual` y la
 * resolución automática no la vuelve a tocar (RN-6). Si queda apuntando a una
 * combinación, completa las líneas abiertas que la esperaban; el reparto lo corre
 * quien llama si `lineasCompletadas` es mayor que cero.
 */
export async function mapearClave(
  db: PrismaClient,
  tenantId: string,
  id: string,
  cambios: CambiosDeMapeo
) {
  const mapeo = await db.mapeoCanal.findFirst({ where: { id, tenantId } });
  if (!mapeo) throw new ErrorDeMapeo("mapeo no encontrado", 404);

  const data: { combinacionId?: string | null; unidades?: number; ignorar?: boolean; origen: string } = { origen: "manual" };

  if ("unidades" in cambios) {
    const u = Number(cambios.unidades);
    if (!Number.isInteger(u) || u < 1 || u > 1000) throw new ErrorDeMapeo("unidades tiene que ser un entero entre 1 y 1000");
    data.unidades = u;
  }

  if ("combinacionId" in cambios) {
    if (cambios.combinacionId) {
      const c = await db.combinacion.findFirst({
        where: { id: cambios.combinacionId, tenantId },
        select: { id: true, activo: true },
      });
      if (!c) throw new ErrorDeMapeo("combinación no encontrada");
      if (!c.activo) throw new ErrorDeMapeo("esa combinación está desactivada");
      data.combinacionId = c.id;
      data.ignorar = false; // elegir qué es cancela "otro negocio"
    } else {
      data.combinacionId = null;
    }
  }

  if ("ignorar" in cambios) {
    data.ignorar = Boolean(cambios.ignorar);
    if (data.ignorar) data.combinacionId = null;
  }

  const actualizado = await db.mapeoCanal.update({
    where: { id: mapeo.id },
    data,
    include: { combinacion: { select: { id: true, nombre: true, sku: true, activo: true, modeloId: true, variantes: true } } },
  });

  let lineasCompletadas = 0;
  if (actualizado.combinacion && !actualizado.ignorar) {
    lineasCompletadas = await completarLineasDeClave(
      db,
      tenantId,
      actualizado.canal as Canal,
      actualizado.clave,
      actualizado.combinacion,
      actualizado.unidades
    );
  }
  return { mapeo: actualizado, lineasCompletadas };
}

/** Texto corto de lo que se vendió, para la cola: "Título · Color: Rojo · 95cm". */
export function describirVenta(titulo: string, opciones: Array<{ grupo?: string | null; nombre: string }>): string {
  return [titulo.trim(), ...opciones.map((o) => (o.grupo ? `${o.grupo}: ${o.nombre}` : o.nombre))]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 300);
}
