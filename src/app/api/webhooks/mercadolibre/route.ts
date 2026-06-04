export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { getOrder } from "@/lib/mercadolibre";
import { processMlOrder } from "@/lib/mercadolibre-sync";
import { NextRequest, NextResponse, after } from "next/server";
import type { Prisma } from "@/generated/prisma";

/**
 * Receptor de notificaciones de Mercado Libre.
 *
 * ML hace POST con un body tipo:
 *   { resource: "/orders/123", topic: "orders_v2", user_id: 456, application_id: 999 }
 *
 * Estrategia:
 *  - Respondemos 200 INMEDIATAMENTE (ML exige respuesta rápida o reintenta /
 *    deshabilita la app) y procesamos el pedido en segundo plano con `after()`.
 *  - Solo procesamos `orders_v2` (las ventas). El topic `payments` no aporta
 *    (la liquidación se deriva del envío) y ML lo manda como /collections/* que
 *    no se puede consultar → lo ignoramos sin ruido.
 *  - La identidad se valida resolviendo el tenant por `user_id`. Los datos se
 *    traen siempre desde la API de ML, nunca del body → no se pueden falsear.
 */

interface MlNotification {
  resource?: string;
  topic?: string;
  user_id?: number;
  application_id?: number;
  attempts?: number;
}

function extractId(resource: string | undefined): string | null {
  if (!resource) return null;
  const parts = resource.split("/").filter(Boolean);
  return parts[parts.length - 1] || null;
}

const TOPICS_ORDEN = new Set(["orders_v2", "orders", "created_orders"]);

export async function POST(request: NextRequest) {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  let body: MlNotification;
  try {
    body = (await request.json()) as MlNotification;
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid_json" }, { status: 200 });
  }

  const topic = body.topic || "unknown";
  const userId = body.user_id != null ? String(body.user_id) : null;

  // Solo nos interesan las notificaciones de órdenes. El resto (payments,
  // messages, etc.) se responde 200 sin procesar ni loguear (evita ruido).
  if (!TOPICS_ORDEN.has(topic)) {
    return NextResponse.json({ ok: true, ignored: `topic:${topic}` }, { status: 200 });
  }

  const orderId = extractId(body.resource);
  if (!userId || !orderId) {
    return NextResponse.json({ ok: true, ignored: "datos_incompletos" }, { status: 200 });
  }

  // Resolver tenant por la cuenta conectada con ese ml_user_id
  const cuenta = await prisma.cuentaMercadolibre.findFirst({
    where: { mlUserId: userId },
    select: { tenantId: true },
  });
  if (!cuenta) {
    return NextResponse.json({ ok: true, ignored: "no_account" }, { status: 200 });
  }
  const tenantId = cuenta.tenantId;

  // Procesar en segundo plano: ML recibe el 200 de inmediato.
  after(async () => {
    try {
      const order = await getOrder(tenantId, orderId);
      const result = await processMlOrder(tenantId, order, { source: "webhook" });
      await prisma.webhookLog.create({
        data: {
          tenantId,
          origen: "mercadolibre",
          evento: topic,
          externoId: orderId,
          estado: result.action === "ignored" ? "ignorado" : "ok",
          errorMsg:
            result.warnings.length > 0
              ? `${result.action}: ${result.warnings.length} warnings`
              : `${result.action}${result.reason ? `: ${result.reason}` : ""}`,
          pedidoId: result.pedidoId ?? null,
          payload: body as unknown as Prisma.InputJsonValue,
          ipAddress,
        },
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "unknown_error";
      await prisma.webhookLog
        .create({
          data: {
            tenantId,
            origen: "mercadolibre",
            evento: topic,
            externoId: orderId,
            estado: "error",
            errorMsg: errorMsg.slice(0, 500),
            payload: body as unknown as Prisma.InputJsonValue,
            ipAddress,
          },
        })
        .catch(() => {});
      console.error("[webhooks/mercadolibre] error procesando orden:", e);
    }
  });

  return NextResponse.json({ ok: true, queued: orderId }, { status: 200 });
}
