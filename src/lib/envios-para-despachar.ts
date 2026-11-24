import { prisma } from "@/lib/prisma";
import { mlFetch, type MlShipment } from "@/lib/mercadolibre";
import { envioYaSalio } from "@/lib/mercadolibre-sync";

/**
 * Lo que hay que despachar de Mercado Libre (docs/sdd/017, spec 002), para la página Etiquetas de la
 * Bodega.
 *
 * Sale de los pedidos de ML de la cuenta Sendero 3D que no se entregaron ni se cancelaron (decisión
 * de Agustín, 2026-11-20: Sendero Shop no se imprime desde esa PC), más el estado de cada envío
 * leído de ML en el momento: si la etiqueta está lista, ya impresa o todavía no la libera ML.
 *
 * RN-1: nada del comprador. Sólo número de venta, envío, Flex, fechas y los productos del ERP.
 */

const TENANT = "sendero3d";
const EN_PARALELO = 8;

export type EstadoEtiqueta = "lista" | "impresa" | "en_fabricacion" | "pendiente" | "sin_dato";

export interface EnvioParaDespachar {
  pedidoId: string;
  /** El número de venta (el pack si es un carrito). */
  venta: string;
  envioId: string | null;
  flex: boolean;
  /** Hasta cuándo despachar: el SLA de ML con hora, o el día que calculó el ERP. ISO. */
  despacho: string | null;
  /** El despacho trae hora de ML (no es sólo el día). */
  conHora: boolean;
  estado: EstadoEtiqueta;
  /** Estado y subestado de ML, para mostrar si hace falta. */
  ml: { status: string | null; substatus: string | null };
  /** Lo que va en la caja: la combinación vendida (con su opción), o el producto. */
  productos: Array<{ nombre: string; cantidad: number }>;
  /** El estado del pedido en el ERP (Confirmado, En producción, Terminado), para Reparto. */
  estadoPedido?: string;
  /**
   * Sólo para Reparto (`conDestino`), para la zona: provincia, localidad y CP del envío. La Bodega no
   * lo pide ni lo recibe (RN-1).
   */
  destino?: { provincia: string | null; localidad: string | null; cp: string | null };
}

export interface EnviosParaDespachar {
  envios: EnvioParaDespachar[];
  leidoEn: string;
  /** Pedidos cuyo envío no se pudo leer en ML (sin datos del comprador). */
  errores: Array<{ venta: string; error: string }>;
}

function estadoDe(s: MlShipment | null): EstadoEtiqueta {
  if (!s) return "sin_dato";
  if (s.status === "ready_to_ship" && s.substatus === "printed") return "impresa";
  if (s.status === "ready_to_ship" && (s.substatus === "ready_to_print" || !s.substatus)) return "lista";
  if (s.substatus === "manufacturing") return "en_fabricacion";
  if (s.status === "ready_to_ship") return "lista";
  return "pendiente";
}

async function enTandas<T, R>(xs: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += EN_PARALELO) out.push(...(await Promise.all(xs.slice(i, i + EN_PARALELO).map(fn))));
  return out;
}

export async function enviosParaDespachar(op: { conDestino?: boolean } = {}): Promise<EnviosParaDespachar> {
  const pedidos = await prisma.pedido.findMany({
    where: {
      tenantId: TENANT,
      canalVenta: "mercadolibre",
      estado: { in: ["CONFIRMADO", "EN_PRODUCCION", "TERMINADO"] },
    },
    select: {
      id: true,
      idMercadolibre: true,
      estado: true,
      fechaEntrega: true,
      origenExterno: true,
      items: {
        select: { cantidad: true, descripcion: true, modelo: { select: { nombre: true } }, combinacion: { select: { nombre: true } } },
      },
    },
    orderBy: { fechaEntrega: "asc" },
  });

  // Sólo la cuenta principal (cuenta_ml vacío). Sin orden de ML no hay envío que imprimir.
  const deLaPrincipal = pedidos.filter((p) => {
    const o = (p.origenExterno ?? {}) as { cuenta_ml?: string | null; order_ids?: unknown };
    return !o.cuenta_ml && Array.isArray(o.order_ids) && o.order_ids.length > 0;
  });

  const errores: EnviosParaDespachar["errores"] = [];
  const filas = await enTandas(deLaPrincipal, async (p) => {
    const o = p.origenExterno as { order_ids: Array<string | number>; es_flex?: boolean | string; pack_id?: string | null };
    const venta = String(o.pack_id ?? p.idMercadolibre ?? o.order_ids[0]);
    let envio: MlShipment | null = null;
    let envioId: string | null = null;
    let sla: string | null = null;
    try {
      const orden = await mlFetch<{ shipping?: { id?: number | null } }>(TENANT, `/orders/${o.order_ids[0]}`);
      envioId = orden.shipping?.id ? String(orden.shipping.id) : null;
      if (envioId) {
        envio = await mlFetch<MlShipment>(TENANT, `/shipments/${envioId}`);
        if (envio.substatus !== "manufacturing" && !envioYaSalio(envio.status, envio.substatus)) {
          sla = (await mlFetch<{ expected_date?: string | null }>(TENANT, `/shipments/${envioId}/sla`).catch(() => null))?.expected_date ?? null;
        }
      }
    } catch (e) {
      errores.push({ venta, error: e instanceof Error ? e.message.slice(0, 120) : String(e) });
    }
    // Ya salió, se canceló o no hay envío de ML (se acuerda la entrega): no hay etiqueta.
    if (envio && (envioYaSalio(envio.status, envio.substatus) || envio.status === "cancelled")) return null;
    if (!envioId && !errores.some((x) => x.venta === venta)) return null;

    const fila: EnvioParaDespachar = {
      pedidoId: p.id,
      venta,
      envioId,
      flex: envio ? envio.logistic_type === "self_service" : o.es_flex === true || o.es_flex === "true",
      despacho: sla ?? p.fechaEntrega?.toISOString() ?? null,
      conHora: !!sla,
      estado: estadoDe(envio),
      ml: { status: envio?.status ?? null, substatus: envio?.substatus ?? null },
      productos: p.items.map((i) => ({ nombre: i.combinacion?.nombre ?? i.modelo?.nombre ?? i.descripcion ?? "Producto", cantidad: i.cantidad })),
      estadoPedido: p.estado,
    };
    if (op.conDestino && envio) {
      const a = (envio as { receiver_address?: { state?: { name?: string | null } | null; city?: { name?: string | null } | null; neighborhood?: { name?: string | null } | null; zip_code?: string | null } }).receiver_address ?? {};
      fila.destino = { provincia: a.state?.name ?? null, localidad: a.city?.name ?? a.neighborhood?.name ?? null, cp: a.zip_code ?? null };
    }
    return fila;
  });

  const envios = filas
    .filter((f): f is EnvioParaDespachar => !!f)
    .sort((a, b) => (a.despacho ?? "9").localeCompare(b.despacho ?? "9") || Number(b.flex) - Number(a.flex));
  return { envios, leidoEn: new Date().toISOString(), errores };
}
