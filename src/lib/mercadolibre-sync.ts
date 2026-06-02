import { prisma } from "@/lib/prisma";
import { normalizeForMatch } from "@/lib/webhook-security";
import { getOrder, getPayment, type MlOrder } from "@/lib/mercadolibre";
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

function buyerNombre(buyer: MlOrder["buyer"]): string {
  const full = [buyer.first_name, buyer.last_name].filter(Boolean).join(" ").trim();
  return full || buyer.nickname || `Comprador ML ${buyer.id}`;
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
 * Procesa una orden completa de ML: crea/actualiza cliente + pedido + items.
 * Idempotente por orden.
 */
export async function processMlOrder(
  tenantId: string,
  order: MlOrder,
  opts: { source: "webhook" | "backfill" } = { source: "webhook" }
): Promise<ProcessResult> {
  const orderId = String(order.id);
  const warnings: string[] = [];

  const existente = await findExistingPedido(tenantId, orderId);

  // Si ya existe, no recreamos. Solo intentamos actualizar la fecha de liquidación
  // (y solo si todavía no la tiene, para no reconsultar pagos innecesariamente).
  if (existente) {
    if (existente.tieneFechaLiq) {
      return {
        action: "skipped_existing",
        pedidoId: existente.id,
        estado: existente.estado,
        warnings,
        reason: "pedido_ya_existe",
      };
    }
    const fechaLiq = await resolverFechaLiquidacion(tenantId, order);
    if (fechaLiq) {
      await prisma.pedido.update({
        where: { id: existente.id },
        data: { fechaLiquidacionMl: fechaLiq },
      });
      return {
        action: "updated",
        pedidoId: existente.id,
        estado: existente.estado,
        warnings,
        reason: "fecha_liquidacion_actualizada",
      };
    }
    return {
      action: "skipped_existing",
      pedidoId: existente.id,
      estado: existente.estado,
      warnings,
      reason: "pedido_ya_existe",
    };
  }

  // Órdenes canceladas que NO existen: las ignoramos (no ensuciamos el inventario)
  if (order.status === "cancelled") {
    return { action: "ignored", warnings, reason: "orden_cancelada" };
  }

  const fechaLiquidacion = await resolverFechaLiquidacion(tenantId, order);

  const result = await prisma.$transaction(async (tx) => {
    // ── Cliente: buscar por nombre, si no crear ──
    const nombre = buyerNombre(order.buyer);
    let cliente = await tx.cliente.findFirst({
      where: { tenantId, nombre: { equals: nombre, mode: "insensitive" }, plataforma: "mercadolibre" },
    });
    if (!cliente) {
      cliente = await tx.cliente.create({
        data: { tenantId, nombre, plataforma: "mercadolibre" },
      });
    }

    // ── Items: SKU → modelo, variation_attributes → variantes ──
    const itemsData: Array<{
      modeloId: string;
      cantidad: number;
      precioUnitario: number;
      costoUnitario: number;
      ajusteManual: number;
      variantesInfo: Prisma.InputJsonValue;
    }> = [];

    for (const oi of order.order_items) {
      const sku = oi.item.seller_sku?.trim() || null;
      const titulo = oi.item.title;

      let modelo = null;
      if (sku) {
        modelo = await tx.modelo.findFirst({
          where: { tenantId, sku, consolidadoEnId: null },
          include: { variantes: true },
        });
      }
      if (!modelo) {
        modelo = await tx.modelo.findFirst({
          where: {
            tenantId,
            consolidadoEnId: null,
            nombre: { equals: titulo, mode: "insensitive" },
          },
          include: { variantes: true },
        });
      }

      if (!modelo) {
        warnings.push(`Producto sin match: "${titulo}" (SKU: ${sku || "—"})`);
        continue;
      }

      // Variantes desde variation_attributes (ej: "Tamaño: 65cm")
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
          variantesMatched.push({
            nombre: attr.value_name,
            mlAtributo: attr.name,
            matched: false,
          });
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
      throw new Error("ningún item de la orden ML pudo mapearse a modelos del inventario");
    }

    const necesitaRevision = warnings.length > 0;
    const pedido = await tx.pedido.create({
      data: {
        tenantId,
        clienteId: cliente.id,
        estado: mapEstadoMl(order.status),
        prioridad: "ALTA",
        canalVenta: "mercadolibre",
        fechaPedido: order.date_created ? new Date(order.date_created) : new Date(),
        fechaEntrega: addBusinessDays(new Date(), 3),
        fechaLiquidacionMl: fechaLiquidacion,
        idMercadolibre: orderId,
        externoId: `ML-${orderId}`,
        contacto: order.buyer.nickname || null,
        notas: buildNotas(order, warnings),
        etiquetas: necesitaRevision ? ["revision_manual"] : [],
        origenExterno: {
          sistema: "mercadolibre",
          order_id: orderId,
          status_ml: order.status,
          pack_id: order.pack_id ?? null,
          total_amount: order.total_amount,
          source: opts.source,
          recibido_en: new Date().toISOString(),
          warnings,
        } as Prisma.InputJsonValue,
        items: { create: itemsData },
      },
      select: { id: true, estado: true },
    });

    return pedido;
  });

  return {
    action: "created",
    pedidoId: result.id,
    estado: result.estado,
    warnings,
  };
}

function buildNotas(order: MlOrder, warnings: string[]): string {
  const lines: string[] = [`🛒 Venta Mercado Libre: ${order.id}`];
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
  const orderId = String(pago.order_id);
  const existente = await findExistingPedido(tenantId, orderId);
  if (!existente) {
    // El pedido aún no llegó (puede pasar si payments llega antes que orders).
    // Traemos la orden y la procesamos completa.
    try {
      const order = await getOrder(tenantId, orderId);
      return processMlOrder(tenantId, order, { source: "webhook" });
    } catch {
      return { action: "ignored", warnings: [], reason: "pedido_no_encontrado" };
    }
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
