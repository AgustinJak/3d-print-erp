export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { costoModelo, costoVariante } from "@/lib/costos";
import {
  aplicarEstadoPedido,
  cancelarPedidoExterno,
  ESTADOS_QUE_CONSUMEN,
  reasignarReservas,
} from "@/lib/reservas";
import { verifyWebhookSignature, normalizeForMatch } from "@/lib/webhook-security";

/**
 * Encuentra el modelo del tamaño elegido cuando la Shop pega contra uno partido.
 *
 * Las katanas se separaron en un modelo por tamaño (`… 65cm`, `… 95cm`, con SKU
 * `<sku>-65` y `<sku>-95`), pero la Shop las sigue vendiendo con un solo
 * producto que conserva el SKU viejo y ofrece el tamaño como opción. Sin esto
 * la venta entra contra el modelo inactivo, que no tiene filas de stock ni
 * recetas: no reserva la katana, no descuenta la funda, y lo único que asoma es
 * un aviso suelto de que no está definida cuál funda lleva.
 *
 * Son 16 los modelos viejos que todavía tienen SKU y la Shop puede pegar, así
 * que no alcanzaba con arreglar el pedido a mano.
 *
 * Devuelve también qué opción definió el tamaño: el modelo nuevo ya *es* ese
 * tamaño, así que buscarla entre sus variantes sólo daría un falso 'sin match'.
 */
async function resolverModeloPorTamano(
  tx: Prisma.TransactionClient,
  tenantId: string,
  modelo: { id: string; nombre: string; sku: string | null; activo: boolean },
  opciones: Array<{ nombre: string }>
): Promise<{ modeloId: string | null; opcionTamano: string | null }> {
  // Un modelo activo es el destino, no el origen: no hay nada que redirigir.
  if (modelo.activo) return { modeloId: null, opcionTamano: null };

  for (const op of opciones) {
    const medida = /^\s*(\d{2,3})\s*cm\s*$/i.exec(op.nombre)?.[1];
    if (!medida) continue;

    const porSku = modelo.sku
      ? await tx.modelo.findFirst({
          where: { tenantId, sku: `${modelo.sku}-${medida}`, activo: true, consolidadoEnId: null },
          select: { id: true },
        })
      : null;

    // Por nombre como respaldo: al partirlos quedaron como “<viejo> <medida>cm”,
    // y un SKU se puede haber cargado distinto.
    const destino =
      porSku ??
      (await tx.modelo.findFirst({
        where: {
          tenantId,
          activo: true,
          consolidadoEnId: null,
          nombre: { equals: `${modelo.nombre} ${medida}cm`, mode: "insensitive" },
        },
        select: { id: true },
      }));

    if (destino) return { modeloId: destino.id, opcionTamano: op.nombre };
  }
  return { modeloId: null, opcionTamano: null };
}
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
  /** Trabajo a medida, fuera del catálogo: viene sin SKU y no tiene modelo. */
  personalizado: z.boolean().optional().default(false),
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

/* ─────────────── Cambio de estado de un pedido que ya existe ───────────────
 *
 * El webhook original sólo sabe crear. Su idempotencia es por `numero_pedido`:
 * si el pedido ya está, devuelve el existente y no mira nada más. Por eso
 * reenviarlo con otro estado no hace nada, y los cambios necesitan un evento
 * aparte.
 *
 * El evento es genérico —"cambió a tal estado"— y no "pedido.entregado", para
 * que avisar una cancelación no obligue a negociar otro contrato.
 * Hoy mueven algo acá `entregado` y `cancelado`.
 * ───────────────────────────────────────────────────────────────────────── */

const EVENTO_CAMBIO_ESTADO = "pedido.estado_cambiado";

const cambioEstadoSchema = z.object({
  evento: z.literal(EVENTO_CAMBIO_ESTADO),
  numero_pedido: z.string(),
  estado_shop: z.string(),
  /** Cuándo pasó, no cuándo se mandó el webhook: si se reintenta, no se pierde. */
  fecha: z.string().optional().nullable(),
});

/**
 * Qué estado del inventario corresponde a cada estado de la Shop.
 *
 * Corto a propósito: lo que no esté acá se registra y se ignora con 200, así la
 * Shop no queda reintentando algo que nunca vamos a procesar.
 */
const ESTADO_SHOP_A_INVENTARIO: Record<string, "COMPLETADO" | "CANCELADO"> = {
  entregado: "COMPLETADO",
  cancelado: "CANCELADO",
};

/** Un pedido que ya terminó no vuelve atrás por un webhook que llegó tarde. */
const ESTADOS_FINALES = new Set(["COMPLETADO", "CANCELADO"]);

async function manejarCambioDeEstado(
  rawBody: string,
  tenantId: string,
  ipAddress: string | null
): Promise<NextResponse> {
  const log = (estado: string, errorMsg: string | null, externoId?: string, pedidoId?: string) =>
    prisma.webhookLog
      .create({
        data: {
          tenantId,
          origen: "shop",
          evento: EVENTO_CAMBIO_ESTADO,
          externoId: externoId ?? null,
          estado,
          errorMsg,
          pedidoId: pedidoId ?? null,
          payload: tryParseJson(rawBody) as Prisma.InputJsonValue,
          ipAddress,
        },
      })
      .catch(() => {});

  let payload: z.infer<typeof cambioEstadoSchema>;
  try {
    payload = cambioEstadoSchema.parse(JSON.parse(rawBody));
  } catch (e) {
    await log("error", `invalid_schema: ${e instanceof Error ? e.message : "?"}`.slice(0, 500));
    return NextResponse.json({ error: "invalid_schema" }, { status: 400 });
  }

  const pedido = await prisma.pedido.findFirst({
    where: { tenantId, externoId: payload.numero_pedido },
    select: { id: true, estado: true, origenExterno: true, etiquetas: true, notas: true },
  });

  if (!pedido) {
    // 404 y no 500: el pedido nunca llegó acá. Que la Shop lo registre en vez
    // de reintentar para siempre contra algo que no existe.
    await log("error", "pedido_inexistente", payload.numero_pedido);
    return NextResponse.json({ error: "pedido_inexistente" }, { status: 404 });
  }

  const destino = ESTADO_SHOP_A_INVENTARIO[payload.estado_shop];
  if (!destino) {
    await log("ignorado", `estado_sin_mapeo: ${payload.estado_shop}`, payload.numero_pedido, pedido.id);
    return NextResponse.json({ ok: true, ignorado: `estado_sin_mapeo:${payload.estado_shop}` });
  }

  // Reenviar el mismo estado no descuenta dos veces.
  if (pedido.estado === destino) {
    await log("ok", "ya_estaba", payload.numero_pedido, pedido.id);
    return NextResponse.json({ ok: true, pedidoId: pedido.id, estado: pedido.estado, sinCambio: true });
  }

  // Una cancelación llega también sobre un pedido ya completado: el Shop la
  // admite hasta 10 días después de la entrega. Por eso va antes del corte de
  // estados finales.
  if (destino === "CANCELADO") {
    const r = await cancelarDesdeShop(tenantId, pedido, payload.fecha ?? null);
    await log("ok", r.revisarStock ? "cancelado_con_stock_a_revisar" : null, payload.numero_pedido, pedido.id);
    return NextResponse.json({
      ok: true,
      pedidoId: pedido.id,
      estado: "CANCELADO",
      desde: pedido.estado,
      devueltas: r.devueltas,
      revisarStock: r.revisarStock,
    });
  }

  if (ESTADOS_FINALES.has(pedido.estado)) {
    await log("ignorado", `estado_final: ${pedido.estado}`, payload.numero_pedido, pedido.id);
    return NextResponse.json({ ok: true, ignorado: `ya_cerrado:${pedido.estado}`, estado: pedido.estado });
  }

  const oe = (pedido.origenExterno ?? {}) as Record<string, unknown>;
  await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      estado: destino,
      origenExterno: {
        ...oe,
        estado_shop: payload.estado_shop,
        entregado_en: payload.fecha ?? null,
        estado_actualizado_en: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  // Acá deja de ser un cambio de etiqueta: COMPLETADO consume las reservas y
  // descuenta el stock de verdad.
  await aplicarEstadoPedido(tenantId, pedido.id, destino);

  await log("ok", null, payload.numero_pedido, pedido.id);
  return NextResponse.json({ ok: true, pedidoId: pedido.id, estado: destino, desde: pedido.estado });
}

/**
 * El Shop canceló un pedido que ya está acá. Misma regla que Mercado Libre
 * (`cancelarPedidoExterno`): si la pieza no salió, el stock vuelve; si ya
 * salió, no vuelve solo y el pedido queda marcado para que alguien mire si la
 * caja volvió.
 *
 * "Ya salió" es lo que diga el stock —reservas consumidas— o el estado: un
 * pedido completado con piezas impresas a pedido no consumió nada, pero la
 * pieza la tiene el cliente igual.
 */
async function cancelarDesdeShop(
  tenantId: string,
  pedido: { id: string; estado: string; origenExterno: unknown; etiquetas: string[]; notas: string | null },
  fecha: string | null
): Promise<{ devueltas: number; revisarStock: boolean }> {
  const oe = (pedido.origenExterno ?? {}) as Record<string, unknown>;

  // El estado va primero: el reparto que corre adentro de la cancelación tiene
  // que ver el pedido ya cancelado, o le volvería a reservar stock.
  await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      estado: "CANCELADO",
      origenExterno: {
        ...oe,
        estado_shop: "cancelado",
        cancelado_en: fecha,
        estado_actualizado_en: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  const { devueltas, revisarStock: consumido } = await cancelarPedidoExterno(
    tenantId,
    pedido.id,
    "cancelacion_shop"
  );
  const revisarStock = consumido || ESTADOS_QUE_CONSUMEN.some((e) => e === pedido.estado);

  const cuando = new Date(fecha ?? Date.now()).toLocaleDateString("es-AR");
  const nota =
    `[${cuando}] El Shop canceló este pedido.` +
    (revisarStock
      ? " Ya se había entregado: el stock no volvió solo, revisar si la pieza volvió antes de sumarla."
      : devueltas > 0
        ? ` Volvieron ${devueltas} unidades al stock.`
        : "");

  await prisma.pedido.update({
    where: { id: pedido.id },
    data: {
      etiquetas: [
        ...new Set([...pedido.etiquetas, "cancelado_shop", ...(revisarStock ? ["revision_manual"] : [])]),
      ],
      notas: [pedido.notas, nota].filter(Boolean).join("\n"),
    },
  });

  return { devueltas, revisarStock };
}

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

  // 3b. Un cambio de estado va por otro camino: el pedido ya existe y lo único
  //     que llega es su estado nuevo. Se bifurca antes de `payloadSchema`, que
  //     exige el pedido entero.
  if ((tryParseJson(rawBody) as { evento?: unknown } | null)?.evento === EVENTO_CAMBIO_ESTADO) {
    return manejarCambioDeEstado(rawBody, tenantId, ipAddress);
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
        modeloId: string | null;
        descripcion: string | null;
        cantidad: number;
        precioUnitario: number;
        costoUnitario: number;
        ajusteManual: number;
        variantesInfo: Prisma.InputJsonValue;
      }> = [];

      const warnings: string[] = [];
      const aMedida: string[] = [];

      // Una línea sin modelo guarda igual lo que eligió el comprador, como
      // registro: sin `varianteId`, así no entra en ningún reparto de stock.
      const opcionesComoRegistro = (item: ShopPayload["items"][number]) =>
        item.opciones_seleccionadas.map((o) => ({
          nombre: o.nombre,
          shopGrupo: o.grupo,
          precioExtra: o.precio_extra ?? 0,
          matched: false,
        })) as unknown as Prisma.InputJsonValue;

      for (const item of payload.items) {
        // Un trabajo a medida no es del catálogo: no hay modelo que buscar, ni
        // stock que reservar, ni nada que revisar. Entra como línea sin modelo
        // para que el pedido cobre lo que cobró y aparezca en producción.
        if (item.personalizado) {
          itemsData.push({
            modeloId: null,
            descripcion: `A medida: ${item.nombre_producto}`,
            cantidad: item.cantidad,
            precioUnitario: item.precio_unitario,
            costoUnitario: 0,
            ajusteManual: 0,
            variantesInfo: opcionesComoRegistro(item),
          });
          aMedida.push(item.nombre_producto);
          continue;
        }

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

        // Un producto del catálogo que no coincide no se descarta: la plata ya
        // se cobró, y sin la línea el pedido quedaba mal o, si eran todas así,
        // directamente no entraba. Va sin modelo y el pedido queda a revisar.
        if (!modelo) {
          warnings.push(
            `Producto sin match: "${item.nombre_producto}" (SKU: ${item.sku || "—"}). Quedó como línea sin modelo: editá el pedido y cargalo con el modelo que corresponde.`
          );
          itemsData.push({
            modeloId: null,
            descripcion: `Sin modelo: ${item.nombre_producto}${item.sku ? ` (SKU ${item.sku})` : ""}`,
            cantidad: item.cantidad,
            precioUnitario: item.precio_unitario,
            costoUnitario: 0,
            ajusteManual: 0,
            variantesInfo: opcionesComoRegistro(item),
          });
          continue;
        }

        // El SKU puede ser el de un modelo partido por tamaño. No se avisa: la
        // redirección es el comportamiento correcto, y marcar cada katana de la
        // Shop para revisión manual sería ruido, no información.
        const porTamano = await resolverModeloPorTamano(tx, tenantId, modelo, item.opciones_seleccionadas);
        if (porTamano.modeloId) {
          const nuevo = await tx.modelo.findFirst({
            where: { id: porTamano.modeloId },
            include: { variantes: true },
          });
          if (nuevo) modelo = nuevo;
        }

        // Mapear variantes seleccionadas a las variantes cargadas en el inventario
        const variantesMatched: Array<{
          nombre: string;
          shopGrupo?: string;
          precioExtra: number;
          matched: boolean;
          varianteId?: string;
          costoFabAdicional?: number;
          /** El tamaño que definió cuál modelo es: no es una variante de éste. */
          absorbidaEnElModelo?: boolean;
        }> = [];

        let costoExtraVariantes = 0;
        for (const opcion of item.opciones_seleccionadas) {
          // El tamaño ya quedó absorbido en la identidad del modelo. Se guarda
          // para el registro de lo que eligió el comprador, sin `varianteId`:
          // así no entra en el reparto de stock ni suma costo dos veces.
          if (porTamano.opcionTamano && opcion.nombre === porTamano.opcionTamano) {
            variantesMatched.push({
              nombre: opcion.nombre,
              shopGrupo: opcion.grupo,
              precioExtra: opcion.precio_extra ?? 0,
              matched: true,
              absorbidaEnElModelo: true,
            });
            continue;
          }

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
            costoExtraVariantes += costoVariante(match);
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
          descripcion: null,
          cantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
          costoUnitario: costoModelo(modelo) + costoExtraVariantes,
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
          notas: buildNotas(payload, warnings, aMedida),
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

function buildNotas(p: ShopPayload, warnings: string[], aMedida: string[]): string {
  const lines: string[] = [`📦 Pedido del Shop: ${p.numero_pedido}`];
  if (p.metodo_pago) lines.push(`💳 Pago: ${p.metodo_pago}`);
  if (p.tipo_envio) lines.push(`🚚 Envío: ${p.tipo_envio}`);
  if (p.sucursal_correo?.nombre) {
    lines.push(`📍 Sucursal: ${p.sucursal_correo.nombre}`);
  }
  if (p.cliente.dni) lines.push(`DNI: ${p.cliente.dni}`);
  // No es un aviso: es lo esperado. Pero el costo de una pieza única no se
  // conoce de antemano y la ganancia del pedido sale inflada hasta cargarlo.
  if (aMedida.length > 0) {
    lines.push("", "🎨 A medida (costo en $0 hasta cargarlo):");
    aMedida.forEach((n) => lines.push(`  • ${n}`));
  }
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
