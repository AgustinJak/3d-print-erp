export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getOrder } from "@/lib/mercadolibre";
import { processMlOrder, processMlPayment, type ProcessResult } from "@/lib/mercadolibre-sync";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";

/**
 * Receptor de notificaciones de Mercado Libre.
 *
 * ML hace POST con un body tipo:
 *   { resource: "/orders/123", topic: "orders_v2", user_id: 456, application_id: 999, attempts: 1 }
 *
 * Reglas:
 *  - Siempre respondemos 200 ante problemas de datos (ML no debe reintentar algo
 *    que nunca se va a resolver solo). Reservamos 5xx para fallos transitorios.
 *  - La identidad se valida resolviendo el tenant por el `user_id` (debe existir
 *    una cuenta conectada con ese ml_user_id). Los datos reales se traen siempre
 *    desde la API de ML con nuestro token, nunca del body → no se pueden falsear.
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

export async function POST(request: NextRequest) {
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  let body: MlNotification;
  try {
    body = (await request.json()) as MlNotification;
  } catch {
    // Body inválido: respondemos 200 para que ML no reintente (es ruido)
    return NextResponse.json({ ok: true, ignored: "invalid_json" }, { status: 200 });
  }

  const topic = body.topic || "unknown";
  const userId = body.user_id != null ? String(body.user_id) : null;

  // Resolver tenant por la cuenta conectada con ese ml_user_id
  let tenantId: string | null = null;
  if (userId) {
    const cuenta = await prisma.cuentaMercadolibre.findFirst({
      where: { mlUserId: userId },
      select: { tenantId: true },
    });
    tenantId = cuenta?.tenantId ?? null;
  }

  // Sin cuenta conectada para ese usuario → no es para nosotros. 200 y a otra cosa.
  if (!tenantId) {
    return NextResponse.json({ ok: true, ignored: "no_account" }, { status: 200 });
  }

  const logBase = {
    tenantId,
    origen: "mercadolibre",
    evento: topic,
    ipAddress,
  };

  try {
    let result: ProcessResult;

    if (topic === "orders_v2" || topic === "orders" || topic === "created_orders") {
      const orderId = extractId(body.resource);
      if (!orderId) {
        await prisma.webhookLog.create({
          data: {
            ...logBase,
            estado: "ignorado",
            errorMsg: "resource_sin_order_id",
            payload: body as unknown as Prisma.InputJsonValue,
          },
        });
        return NextResponse.json({ ok: true, ignored: "no_order_id" }, { status: 200 });
      }
      const order = await getOrder(tenantId, orderId);
      result = await processMlOrder(tenantId, order, { source: "webhook" });
    } else if (topic === "payments") {
      const paymentId = extractId(body.resource);
      if (!paymentId) {
        await prisma.webhookLog.create({
          data: {
            ...logBase,
            estado: "ignorado",
            errorMsg: "resource_sin_payment_id",
            payload: body as unknown as Prisma.InputJsonValue,
          },
        });
        return NextResponse.json({ ok: true, ignored: "no_payment_id" }, { status: 200 });
      }
      result = await processMlPayment(tenantId, paymentId);
    } else {
      // Tópico que no procesamos (ej: messages, items): lo registramos y listo
      await prisma.webhookLog.create({
        data: {
          ...logBase,
          estado: "ignorado",
          errorMsg: `topic_no_manejado: ${topic}`,
          payload: body as unknown as Prisma.InputJsonValue,
        },
      });
      return NextResponse.json({ ok: true, ignored: "topic" }, { status: 200 });
    }

    await prisma.webhookLog.create({
      data: {
        ...logBase,
        externoId: extractId(body.resource),
        estado: result.action === "ignored" ? "ignorado" : "ok",
        errorMsg:
          result.warnings.length > 0
            ? `${result.action}: ${result.warnings.length} warnings`
            : `${result.action}${result.reason ? `: ${result.reason}` : ""}`,
        pedidoId: result.pedidoId ?? null,
        payload: body as unknown as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "unknown_error";

    // Distinguir error de datos (no reintentar) vs transitorio (reintentar)
    const esErrorDeDatos = /no pudo mapearse|ningún item/i.test(errorMsg);

    await prisma.webhookLog
      .create({
        data: {
          ...logBase,
          externoId: extractId(body.resource),
          estado: "error",
          errorMsg: errorMsg.slice(0, 500),
          payload: body as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    if (esErrorDeDatos) {
      // Problema de datos: respondemos 200 para que ML no reintente eternamente.
      // Queda registrado en webhook_logs para revisión manual.
      return NextResponse.json({ ok: false, error: errorMsg, retry: false }, { status: 200 });
    }

    // Error transitorio (API ML caída, token, DB): 500 para que ML reintente.
    console.error("[webhooks/mercadolibre] error transitorio:", e);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
