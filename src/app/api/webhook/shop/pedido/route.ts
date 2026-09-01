export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { reasignarReservas } from "@/lib/reservas";
import { verifyWebhookSignature, normalizeForMatch } from "@/lib/webhook-security";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";

/* ───────────────────────── Schema del payload ─────────────────────────
 * Lo que mandará Sendero Shop por cada pedido confirmado.
 * Diseñado para mapear 1:1 con su tabla `pedidos` + `pedido_items`.
 * ───────────────────────────────────────────────────────────────────── */

const opcionSchema = z.object({
  grupo: z.string().optional(),       // "Tamaño", "Accesorios"
  nombre: z.string(),                 // "65cm", "Con Funda"
  precio_extra: z.number().optional().default(0),
});

const itemSchema = z.object({
  sku: z.string().nullable().optional(),
  nombre_producto: z.string(),
  cantidad: z.number().int().min(1),
  precio_unitario: z.number(),
  opciones_seleccionadas: z.array(opcionSchema).optional().default([]),
  subtotal: z.number().optional(),
});

const direccionSchema = z.object({
  calle: z.string().optional(),
  numero: z.string().optional(),
  piso: z.string().optional(),
  depto: z.string().optional(),
  ciudad: z.string().optional(),
  provincia: z.string().optional(),
  cp: z.string().optional(),
  notas: z.string().optional(),
}).partial().optional();

const payloadSchema = z.object({
  evento: z.literal("pedido.confirmado"),
  numero_pedido: z.string(),                                   // "SS-00001" — clave de idempotencia
  estado_shop: z.string(),                                     // "pago_confirmado" | "pedido_confirmado"
  cliente: z.object({
    nombre: z.string(),
    email: z.string().email().optional().nullable(),
    telefono: z.string().optional().nullable(),
    dni: z.string().optional().nullable(),
  }),
  direccion_envio: direccionSchema,
  metodo_envio: z.string().optional().nullable(),
  tipo_envio: z.string().optional().nullable(),                // "domicilio" | "sucursal"
  costo_envio: z.number().default(0),
  metodo_pago: z.string().optional().nullable(),
  recargo_mp: z.number().optional().default(0),
  subtotal: z.number(),
  total: z.number(),
  sucursal_correo: z
    .object({ id: z.string().optional(), nombre: z.string().optional() })
    .optional()
    .nullable(),
  items: z.array(itemSchema).min(1),
  shop_url: z.string().url().optional(),
});

type ShopPayload = z.infer<typeof payloadSchema>;

/* ───────────────────────── POST handler ───────────────────────── */

export async function POST(request: NextRequest) {
  // 1. Leer raw body PRIMERO (sirve para verificar firma HMAC)
  const rawBody = await request.text();

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;

  const tenantId = request.headers.get("x-shop-tenant") || "sendero3d";
  const signature = request.headers.get("x-shop-signature");
  const timestamp = request.headers.get("x-shop-timestamp");

  // 2. Verificar secret configurado
  const secret = process.env.SHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook/shop/pedido] SHOP_WEBHOOK_SECRET no configurado");
    return NextResponse.json(
      { error: "webhook_not_configured" },
      { status: 500 }
    );
  }

  // 3. Verificar firma HMAC y timestamp
  const verification = verifyWebhookSignature(secret, signature, timestamp, rawBody);
  if (!verification.valid) {
    // No logueamos body cuando falla la firma (podría ser un atacante)
    await prisma.webhookLog
      .create({
        data: {
          tenantId,
          origen: "shop",
          evento: "pedido.confirmado",
          estado: "error",
          errorMsg: `auth_failed: ${verification.reason}`,
          payload: { headers_only: true } as Prisma.InputJsonValue,
          ipAddress,
        },
      })
      .catch(() => {});
    return NextResponse.json({ error: verification.reason }, { status: 401 });
  }

  // 4. Parsear y validar payload
  let payload: ShopPayload;
  try {
    const json = JSON.parse(rawBody);
    payload = payloadSchema.parse(json);
  } catch (e) {
    const errorMsg = e instanceof z.ZodError ? "invalid_schema" : "invalid_json";
    await prisma.webhookLog
      .create({
        data: {
          tenantId,
          origen: "shop",
          evento: "pedido.confirmado",
          estado: "error",
          errorMsg: `${errorMsg}: ${e instanceof Error ? e.message : "?"}`.slice(0, 500),
          payload: tryParseJson(rawBody) as Prisma.InputJsonValue,
          ipAddress,
        },
      })
      .catch(() => {});
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }

  // 5. Idempotencia: si ya procesamos ese numero_pedido, devolver el existente
  const existente = await prisma.pedido.findFirst({
    where: { tenantId, externoId: payload.numero_pedido },
    select: { id: true, estado: true },
  });
  if (existente) {
    await prisma.webhookLog.create({
      data: {
        tenantId,
        origen: "shop",
        evento: "pedido.confirmado",
        externoId: payload.numero_pedido,
        estado: "ignorado",
        errorMsg: "duplicate",
        pedidoId: existente.id,
        payload: payload as unknown as Prisma.InputJsonValue,
        ipAddress,
      },
    });
    return NextResponse.json(
      { ok: true, duplicate: true, pedidoId: existente.id, estado: existente.estado },
      { status: 200 }
    );
  }

  // 6. Buscar/crear cliente y crear pedido (en transacción)
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 6a. Cliente: por email > teléfono > crear nuevo
      const c = payload.cliente;
      let cliente = null;
      if (c.email) {
        cliente = await tx.cliente.findFirst({
          where: { tenantId, email: c.email },
        });
      }
      if (!cliente && c.telefono) {
        cliente = await tx.cliente.findFirst({
          where: { tenantId, telefono: c.telefono },
        });
      }
      if (!cliente) {
        cliente = await tx.cliente.create({
          data: {
            tenantId,
            nombre: c.nombre,
            email: c.email || null,
            telefono: c.telefono || null,
            direccion: formatDireccion(payload.direccion_envio),
            plataforma: "shop",
          },
        });
      } else {
        // Completar campos vacíos sin pisar lo existente
        const updates: Prisma.ClienteUpdateInput = {};
        if (!cliente.email && c.email) updates.email = c.email;
        if (!cliente.telefono && c.telefono) updates.telefono = c.telefono;
        if (!cliente.direccion) {
          const dir = formatDireccion(payload.direccion_envio);
          if (dir) updates.direccion = dir;
        }
        if (Object.keys(updates).length > 0) {
          cliente = await tx.cliente.update({ where: { id: cliente.id }, data: updates });
        }
      }

      // 6b. Mapear items: SKU → modelo + variantes
      const itemsData: Array<{
        modeloId: string;
        cantidad: number;
        precioUnitario: number;
        costoUnitario: number;
        ajusteManual: number;
        variantesInfo: Prisma.InputJsonValue;
      }> = [];

      const warnings: string[] = [];

      for (const item of payload.items) {
        // Buscar modelo por SKU
        let modelo = null;
        if (item.sku) {
          modelo = await tx.modelo.findFirst({
            where: { tenantId, sku: item.sku, consolidadoEnId: null },
            include: { variantes: true },
          });
        }
        // Fallback: buscar por nombre exacto (case-insensitive), excluyendo consolidados
        if (!modelo) {
          modelo = await tx.modelo.findFirst({
            where: {
              tenantId,
              consolidadoEnId: null,
              nombre: { equals: item.nombre_producto, mode: "insensitive" },
            },
            include: { variantes: true },
          });
        }

        if (!modelo) {
          warnings.push(
            `Producto sin match: "${item.nombre_producto}" (SKU: ${item.sku || "—"})`
          );
          continue;
        }

        // Mapear variantes seleccionadas a las variantes cargadas en el inventario
        const variantesMatched: Array<{
          nombre: string;
          shopGrupo?: string;
          precioExtra: number;
          matched: boolean;
          varianteId?: string;
          costoFabAdicional?: number;
        }> = [];

        let costoExtraVariantes = 0;
        for (const opcion of item.opciones_seleccionadas) {
          const target = normalizeForMatch(opcion.nombre);
          const match = modelo.variantes.find(
            (v) => normalizeForMatch(v.nombre) === target
          );
          if (match) {
            variantesMatched.push({
              nombre: match.nombre,
              shopGrupo: opcion.grupo,
              precioExtra: opcion.precio_extra ?? 0,
              matched: true,
              varianteId: match.id,
              costoFabAdicional: match.costoFabAdicional,
            });
            costoExtraVariantes += match.costoFabAdicional;
          } else {
            variantesMatched.push({
              nombre: opcion.nombre,
              shopGrupo: opcion.grupo,
              precioExtra: opcion.precio_extra ?? 0,
              matched: false,
            });
            warnings.push(
              `Variante sin match en "${modelo.nombre}": "${opcion.nombre}"${
                opcion.grupo ? ` (${opcion.grupo})` : ""
              }`
            );
          }
        }

        itemsData.push({
          modeloId: modelo.id,
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
          costoUnitario: modelo.costoFab + costoExtraVariantes,
          ajusteManual: 0,
          variantesInfo: variantesMatched as unknown as Prisma.InputJsonValue,
        });
      }

      if (itemsData.length === 0) {
        throw new Error("ningún item del pedido pudo mapearse a modelos del inventario");
      }

      // 6c. Crear pedido
      const estadoMapeado = mapEstadoShopAInventario(payload.estado_shop);
      const necesitaRevision = warnings.length > 0;
      const fechaEntrega = addBusinessDays(new Date(), 3);

      const pedido = await tx.pedido.create({
        data: {
          tenantId,
          clienteId: cliente.id,
          estado: estadoMapeado,
          prioridad: "ALTA",
          canalVenta: "shop",
          fechaEntrega,
          metodoEnvio: payload.metodo_envio || payload.tipo_envio || null,
          metodoPago: payload.metodo_pago || null,
          precioEnvio: payload.costo_envio,
          contacto: payload.cliente.email || payload.cliente.telefono || null,
          notas: buildNotas(payload, warnings),
          etiquetas: necesitaRevision ? ["revision_manual"] : [],
          externoId: payload.numero_pedido,
          origenExterno: {
            sistema: "shop",
            numero_pedido: payload.numero_pedido,
            estado_shop: payload.estado_shop,
            url: payload.shop_url,
            recibido_en: new Date().toISOString(),
            warnings,
          } as Prisma.InputJsonValue,
          items: { create: itemsData },
        },
        select: { id: true, estado: true },
      });

      return { pedido, clienteId: cliente.id, warnings };
    });

    // 7. Reservar el stock que le toca a este pedido según la cola.
    //    Si falla, el pedido igual quedó guardado: se arregla en el próximo
    //    reparto (es idempotente), pero queda registrado en el log.
    try {
      await reasignarReservas(tenantId);
    } catch (err) {
      console.error("[webhook/shop/pedido] no se pudo repartir el stock:", err);
      result.warnings.push("no se pudo reservar stock: " + (err instanceof Error ? err.message : "?"));
    }

    // 8. Loguear éxito
    await prisma.webhookLog.create({
      data: {
        tenantId,
        origen: "shop",
        evento: "pedido.confirmado",
        externoId: payload.numero_pedido,
        estado: "ok",
        errorMsg: result.warnings.length > 0 ? `warnings: ${result.warnings.length}` : null,
        pedidoId: result.pedido.id,
        payload: payload as unknown as Prisma.InputJsonValue,
        ipAddress,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        pedidoId: result.pedido.id,
        estado: result.pedido.estado,
        warnings: result.warnings,
        revision_manual: result.warnings.length > 0,
      },
      { status: 201 }
    );
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "unknown_error";
    await prisma.webhookLog
      .create({
        data: {
          tenantId,
          origen: "shop",
          evento: "pedido.confirmado",
          externoId: payload.numero_pedido,
          estado: "error",
          errorMsg: errorMsg.slice(0, 500),
          payload: payload as unknown as Prisma.InputJsonValue,
          ipAddress,
        },
      })
      .catch(() => {});
    console.error("[webhook/shop/pedido] error:", e);
    return NextResponse.json({ error: "internal_error", detail: errorMsg }, { status: 500 });
  }
}

/* ───────────────────────── helpers ───────────────────────── */

/**
 * Suma N días hábiles (excluyendo sábados y domingos).
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay(); // 0 = domingo, 6 = sábado
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { _raw_truncated: s.slice(0, 500) };
  }
}

function formatDireccion(d: ShopPayload["direccion_envio"]): string | null {
  if (!d) return null;
  const parts: string[] = [];
  if (d.calle) {
    let street = d.calle;
    if (d.numero) street += ` ${d.numero}`;
    if (d.piso) street += ` ${d.piso}°`;
    if (d.depto) street += ` ${d.depto}`;
    parts.push(street);
  }
  if (d.ciudad) parts.push(d.ciudad);
  if (d.provincia) parts.push(d.provincia);
  if (d.cp) parts.push(`CP ${d.cp}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildNotas(p: ShopPayload, warnings: string[]): string {
  const lines: string[] = [`📦 Pedido del Shop: ${p.numero_pedido}`];
  if (p.metodo_pago) lines.push(`💳 Pago: ${p.metodo_pago}`);
  if (p.tipo_envio) lines.push(`🚚 Envío: ${p.tipo_envio}`);
  if (p.sucursal_correo?.nombre) {
    lines.push(`📍 Sucursal: ${p.sucursal_correo.nombre}`);
  }
  if (p.cliente.dni) lines.push(`DNI: ${p.cliente.dni}`);
  if (warnings.length > 0) {
    lines.push("", "⚠️ Revisar manualmente:");
    warnings.forEach((w) => lines.push(`  • ${w}`));
  }
  return lines.join("\n");
}

function mapEstadoShopAInventario(estadoShop: string) {
  switch (estadoShop) {
    case "pago_confirmado":
    case "pedido_confirmado":
      return "CONFIRMADO" as const;
    case "pendiente_pago":
      return "PENDIENTE_PAGO" as const;
    default:
      return "CONFIRMADO" as const;
  }
}
