import { prisma } from "@/lib/prisma";
import { normalizeForMatch } from "@/lib/webhook-security";
import { getOrder, getPayment, getPack, type MlOrder } from "@/lib/mercadolibre";
import type { Prisma } from "@/generated/prisma";

/**
 * Lógica compartida para convertir una orden de Mercado Libre en un Pedido
 * del inventario. La usan tanto el webhook como el back-fill.
 */

export interface ProcessResult {
  action: "created" | "updated" | "skipped_existing" | "ignored";
  pedidoId?: string;
  estado?: string;
  warnings: string[];
  reason?: string;
}

/** Suma N días hábiles (excluye sábados y domingos). */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

/** Capitaliza cada palabra: "cristina lakos" → "Cristina Lakos". */
function capitalizar(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buyerNombre(buyer: MlOrder["buyer"]): string {
  const full = [buyer.first_name, buyer.last_name].filter(Boolean).join(" ").trim();
  if (full) return capitalizar(full);
  return buyer.nickname || `Comprador ML ${buyer.id}`;
}

/**
 * Identificador estable de la compra: el pack_id si la orden pertenece a un
 * carrito (varios productos), si no el order.id. Es el número que el vendedor
 * ve en ML y el que se carga a mano, así evitamos duplicados.
 */
function packKey(order: MlOrder): string {
  return String(order.pack_id ?? order.id);
}

/**
 * Busca un pedido existente para esta orden ML, tolerando:
 *  - pedidos creados por esta integración (externoId = "ML-<id>")
 *  - pedidos cargados manualmente (id_mercadolibre con/ sin espacios)
 */
type ExistingPedido = { id: string; estado: string; tieneFechaLiq: boolean };

async function findExistingPedido(
  tenantId: string,
  orderId: string
): Promise<ExistingPedido | null> {
  // 1. Por externoId (los que crea esta integración)
  const porExterno = await prisma.pedido.findFirst({
    where: { tenantId, externoId: `ML-${orderId}` },
    select: { id: true, estado: true, fechaLiquidacionMl: true },
  });
  if (porExterno) {
    return {
      id: porExterno.id,
      estado: porExterno.estado,
      tieneFechaLiq: porExterno.fechaLiquidacionMl != null,
    };
  }

  // 2. Por id_mercadolibre con trim tolerante (pedidos viejos cargados a mano)
  const rows = await prisma.$queryRaw<
    Array<{ id: string; estado: string; fecha_liquidacion_ml: Date | null }>
  >`
    SELECT id, estado::text AS estado, fecha_liquidacion_ml
    FROM pedidos
    WHERE tenant_id = ${tenantId}
      AND trim(id_mercadolibre) = ${orderId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, estado: row.estado, tieneFechaLiq: row.fecha_liquidacion_ml != null };
}

function mapEstadoMl(orderStatus: string): "CONFIRMADO" | "CANCELADO" {
  if (orderStatus === "cancelled") return "CANCELADO";
  return "CONFIRMADO";
}

/**
 * Intenta obtener la fecha de liquidación (money_release_date) consultando
 * los pagos aprobados de la orden. Devuelve null si no hay.
 */
async function resolverFechaLiquidacion(
  tenantId: string,
  order: MlOrder
): Promise<Date | null> {
  const pagos = (order.payments || []).filter((p) => p.status === "approved");
  for (const pago of pagos) {
    try {
      const detalle = await getPayment(tenantId, pago.id);
      if (detalle.money_release_date) {
        return new Date(detalle.money_release_date);
      }
    } catch {
      // Si falla la consulta del pago, seguimos sin fecha de liquidación
    }
  }
  return null;
}

/**
 * Procesa una orden recibida por webhook. Si pertenece a un pack (carrito con
 * varios productos), trae todas las órdenes del pack y las agrupa en un pedido.
 */
export async function processMlOrder(
  tenantId: string,
  order: MlOrder,
  opts: { source: "webhook" | "backfill" } = { source: "webhook" }
): Promise<ProcessResult> {
  let orders: MlOrder[] = [order];
  if (order.pack_id) {
    try {
      const pack = await getPack(tenantId, order.pack_id);
      const otrosIds = pack.orders
        .map((o) => String(o.id))
        .filter((id) => id !== String(order.id));
      const otras = await Promise.all(
        otrosIds.map((id) => getOrder(tenantId, id).catch(() => null))
      );
      orders = [order, ...otras.filter((o): o is MlOrder => o !== null)];
    } catch {
      // Si falla traer el pack, procesamos solo la orden recibida
    }
  }
  return processMlOrderGroup(tenantId, orders, opts);
}

/**
 * Procesa un grupo de órdenes del mismo pack (o una sola) como UN pedido.
 * Idempotente por pack_id (o order.id si no hay pack).
 */
export async function processMlOrderGroup(
  tenantId: string,
  orders: MlOrder[],
  opts: { source: "webhook" | "backfill" } = { source: "webhook" }
): Promise<ProcessResult> {
  const principal = orders[0];
  const key = packKey(principal); // pack_id ?? order.id
  const warnings: string[] = [];

  const existente = await findExistingPedido(tenantId, key);

  // Ya existe: solo actualizamos la fecha de liquidación si falta
  if (existente) {
    if (existente.tieneFechaLiq) {
      return { action: "skipped_existing", pedidoId: existente.id, estado: existente.estado, warnings, reason: "pedido_ya_existe" };
    }
    const fechaLiq = await resolverFechaLiquidacionGrupo(tenantId, orders);
    if (fechaLiq) {
      await prisma.pedido.update({ where: { id: existente.id }, data: { fechaLiquidacionMl: fechaLiq } });
      return { action: "updated", pedidoId: existente.id, estado: existente.estado, warnings, reason: "fecha_liquidacion_actualizada" };
    }
    return { action: "skipped_existing", pedidoId: existente.id, estado: existente.estado, warnings, reason: "pedido_ya_existe" };
  }

  // Todas canceladas → ignorar
  if (orders.every((o) => o.status === "cancelled")) {
    return { action: "ignored", warnings, reason: "orden_cancelada" };
  }

  // ── Resolver items por MLA (juntando todos los items del pack) ──
  const itemsData: Array<{
    modeloId: string;
    cantidad: number;
    precioUnitario: number;
    costoUnitario: number;
    ajusteManual: number;
    variantesInfo: Prisma.InputJsonValue;
  }> = [];

  let itemsIgnorados = 0;
  let itemsSinMapear = 0;

  const allItems = orders.flatMap((o) => o.order_items);

  for (const oi of allItems) {
    const mla = oi.item.id;
    const titulo = oi.item.title;

    const mapeo = await prisma.publicacionMl.findUnique({
      where: { tenantId_mla: { tenantId, mla } },
    });

    if (mapeo?.ignorar) {
      itemsIgnorados++;
      continue;
    }

    if (!mapeo || !mapeo.modeloId) {
      itemsSinMapear++;
      await prisma.publicacionMl.upsert({
        where: { tenantId_mla: { tenantId, mla } },
        create: { tenantId, mla, titulo, ultimoMla: key },
        update: { titulo, ultimoMla: key, vecesVista: { increment: 1 } },
      });
      warnings.push(`Publicación sin mapear: "${titulo}" (${mla})`);
      continue;
    }

    const modelo = await prisma.modelo.findFirst({
      where: { tenantId, id: mapeo.modeloId },
      include: { variantes: true },
    });
    if (!modelo) {
      itemsSinMapear++;
      warnings.push(`Modelo mapeado no encontrado para "${titulo}" (${mla})`);
      continue;
    }

    const variantesMatched: Array<Record<string, unknown>> = [];
    let costoExtraVariantes = 0;
    for (const attr of oi.item.variation_attributes || []) {
      const target = normalizeForMatch(attr.value_name);
      const match = modelo.variantes.find((v) => normalizeForMatch(v.nombre) === target);
      if (match) {
        variantesMatched.push({
          nombre: match.nombre,
          mlAtributo: attr.name,
          matched: true,
          varianteId: match.id,
          costoFabAdicional: match.costoFabAdicional,
        });
        costoExtraVariantes += match.costoFabAdicional;
      } else {
        variantesMatched.push({ nombre: attr.value_name, mlAtributo: attr.name, matched: false });
        warnings.push(`Variante sin match en "${modelo.nombre}": "${attr.value_name}"`);
      }
    }

    itemsData.push({
      modeloId: modelo.id,
      cantidad: oi.quantity,
      precioUnitario: oi.unit_price,
      costoUnitario: modelo.costoFab + costoExtraVariantes,
      ajusteManual: 0,
      variantesInfo: variantesMatched as unknown as Prisma.InputJsonValue,
    });
  }

  if (itemsData.length === 0) {
    return {
      action: "ignored",
      warnings,
      reason:
        itemsSinMapear > 0
          ? `publicaciones_sin_mapear (${itemsSinMapear})`
          : `otro_negocio (${itemsIgnorados} ignorados)`,
    };
  }

  // Nombre real del comprador: el /orders/search no trae first_name/last_name,
  // solo el nickname. Si falta, traemos la orden completa para enriquecerlo.
  let buyer = principal.buyer;
  if (!buyer.first_name && !buyer.last_name) {
    try {
      const full = await getOrder(tenantId, principal.id);
      buyer = full.buyer;
    } catch {
      // si falla, usamos el nickname
    }
  }
  const nombre = buyerNombre(buyer);

  const fechaLiquidacion = await resolverFechaLiquidacionGrupo(tenantId, orders);

  const result = await prisma.$transaction(async (tx) => {
    let cliente = await tx.cliente.findFirst({
      where: { tenantId, nombre: { equals: nombre, mode: "insensitive" }, plataforma: "mercadolibre" },
    });
    if (!cliente) {
      cliente = await tx.cliente.create({ data: { tenantId, nombre, plataforma: "mercadolibre" } });
    }

    const necesitaRevision = warnings.length > 0;
    return tx.pedido.create({
      data: {
        tenantId,
        clienteId: cliente.id,
        estado: mapEstadoMl(principal.status),
        prioridad: "ALTA",
        canalVenta: "mercadolibre",
        fechaPedido: principal.date_created ? new Date(principal.date_created) : new Date(),
        fechaEntrega: addBusinessDays(new Date(), 3),
        fechaLiquidacionMl: fechaLiquidacion,
        idMercadolibre: key,
        externoId: `ML-${key}`,
        contacto: buyer.nickname || null,
        notas: buildNotas(principal, key, warnings),
        etiquetas: necesitaRevision ? ["revision_manual"] : [],
        origenExterno: {
          sistema: "mercadolibre",
          pack_id: principal.pack_id ?? null,
          order_ids: orders.map((o) => String(o.id)),
          status_ml: principal.status,
          total_amount: orders.reduce((s, o) => s + (o.total_amount || 0), 0),
          source: opts.source,
          recibido_en: new Date().toISOString(),
          warnings,
        } as Prisma.InputJsonValue,
        items: { create: itemsData },
      },
      select: { id: true, estado: true },
    });
  });

  return { action: "created", pedidoId: result.id, estado: result.estado, warnings };
}

/** Busca la fecha de liquidación en los pagos de cualquier orden del grupo. */
async function resolverFechaLiquidacionGrupo(
  tenantId: string,
  orders: MlOrder[]
): Promise<Date | null> {
  for (const order of orders) {
    const fecha = await resolverFechaLiquidacion(tenantId, order);
    if (fecha) return fecha;
  }
  return null;
}

function buildNotas(order: MlOrder, key: string, warnings: string[]): string {
  const lines: string[] = [`🛒 Venta Mercado Libre: ${key}`];
  if (order.buyer.nickname) lines.push(`👤 ${order.buyer.nickname}`);
  if (order.pack_id) lines.push(`📦 Pack: ${order.pack_id}`);
  if (warnings.length > 0) {
    lines.push("", "⚠️ Revisar manualmente:");
    warnings.forEach((w) => lines.push(`  • ${w}`));
  }
  return lines.join("\n");
}

/**
 * Procesa una notificación de pago: ubica el pedido por su order_id y
 * actualiza la fecha de liquidación.
 */
export async function processMlPayment(
  tenantId: string,
  paymentId: string
): Promise<ProcessResult> {
  const pago = await getPayment(tenantId, paymentId);
  if (!pago.order_id) {
    return { action: "ignored", warnings: [], reason: "payment_sin_order" };
  }

  // Traemos la orden para resolver su pack_id (los pedidos se identifican por
  // pack, no por order.id).
  let order: MlOrder;
  try {
    order = await getOrder(tenantId, String(pago.order_id));
  } catch {
    return { action: "ignored", warnings: [], reason: "orden_no_encontrada" };
  }
  const key = packKey(order);

  const existente = await findExistingPedido(tenantId, key);
  if (!existente) {
    // El pedido aún no llegó (payments puede llegar antes que orders).
    return processMlOrder(tenantId, order, { source: "webhook" });
  }

  if (pago.money_release_date) {
    await prisma.pedido.update({
      where: { id: existente.id },
      data: { fechaLiquidacionMl: new Date(pago.money_release_date) },
    });
    return {
      action: "updated",
      pedidoId: existente.id,
      estado: existente.estado,
      warnings: [],
      reason: "fecha_liquidacion_actualizada",
    };
  }

  return {
    action: "skipped_existing",
    pedidoId: existente.id,
    warnings: [],
    reason: "sin_fecha_liquidacion",
  };
}
