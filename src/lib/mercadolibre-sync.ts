import { prisma } from "@/lib/prisma";
import { costoModelo, costoVariante } from "@/lib/costos";
import { aplicarEstadoPedido, reasignarReservas } from "@/lib/reservas";
import { normalizeForMatch } from "@/lib/webhook-security";

/**
 * Normaliza colapsando TODO lo no alfanumérico, así "95 cm" === "95cm".
 * `normalizeForMatch` deja espacios, por eso los tamaños nunca matcheaban.
 */
const normalizeVariante = (s: string) => normalizeForMatch(s).replace(/s+/g, "");

/** Busca la variante del modelo que corresponde a un valor que mandó ML. */
function buscarVariante<T extends { nombre: string }>(variantes: T[], valor: string): T | undefined {
  const exacto = normalizeForMatch(valor);
  const colapsado = normalizeVariante(valor);
  return (
    variantes.find((v) => normalizeForMatch(v.nombre) === exacto) ??
    variantes.find((v) => normalizeVariante(v.nombre) === colapsado)
  );
}
import {
  getOrder,
  getPayment,
  getPack,
  getShipmentCosts,
  getShipment,
  type MlOrder,
} from "@/lib/mercadolibre";
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
type ExistingPedido = {
  id: string;
  estado: string;
  tieneFechaLiq: boolean;
  esIntegracion: boolean;          // creado por la integración (externoId ML-*)
  tieneNeto: boolean;              // ya tiene el desglose de costos calculado
  tieneFechaDespacho: boolean;     // ya tiene la fecha real de despacho de ML
  liquidacionCalculada: boolean;   // ya se intentó calcular la liquidación
  liquidacionEstimada: boolean;    // la liquidación es estimada (aún no entregado)
  flexEvaluado: boolean;           // ya se evaluó si es Flex
};

async function findExistingPedido(
  tenantId: string,
  orderId: string
): Promise<ExistingPedido | null> {
  // 1. Por externoId (los que crea esta integración)
  const porExterno = await prisma.pedido.findFirst({
    where: { tenantId, externoId: `ML-${orderId}` },
    select: { id: true, estado: true, fechaLiquidacionMl: true, origenExterno: true },
  });
  if (porExterno) {
    const oe = (porExterno.origenExterno ?? {}) as Record<string, unknown>;
    return {
      id: porExterno.id,
      estado: porExterno.estado,
      tieneFechaLiq: porExterno.fechaLiquidacionMl != null,
      esIntegracion: true,
      tieneNeto: oe.costos_ml != null,
      tieneFechaDespacho: oe.fecha_despacho_ml != null,
      liquidacionCalculada: "liquidacion_estimada" in oe,
      liquidacionEstimada: oe.liquidacion_estimada === true,
      flexEvaluado: "es_flex" in oe,
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
  return {
    id: row.id,
    estado: row.estado,
    tieneFechaLiq: row.fecha_liquidacion_ml != null,
    esIntegracion: false, // cargado a mano → no lo tocamos
    tieneNeto: true,
    tieneFechaDespacho: true,
    liquidacionCalculada: true,
    liquidacionEstimada: false,
    flexEvaluado: true,
  };
}

// Mercado Libre libera el dinero ~8 días corridos después de la entrega.
const DIAS_LIQUIDACION = 8;

/** Suma N días corridos, fijando el resultado al mediodía local. */
function addDiasCorridos(date: Date, dias: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + dias);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * Procesa una orden recibida por webhook. Si pertenece a un pack (carrito con
 * varios productos), trae todas las órdenes del pack y las agrupa en un pedido.
 */
/** Dada una orden, devuelve todas las órdenes de su pack (o solo ella). */
async function expandPack(tenantId: string, order: MlOrder): Promise<MlOrder[]> {
  if (!order.pack_id) return [order];
  try {
    const pack = await getPack(tenantId, order.pack_id);
    const otrosIds = pack.orders
      .map((o) => String(o.id))
      .filter((id) => id !== String(order.id));
    const otras = await Promise.all(
      otrosIds.map((id) => getOrder(tenantId, id).catch(() => null))
    );
    return [order, ...otras.filter((o): o is MlOrder => o !== null)];
  } catch {
    return [order];
  }
}

export async function processMlOrder(
  tenantId: string,
  order: MlOrder,
  opts: { source: "webhook" | "backfill" } = { source: "webhook" }
): Promise<ProcessResult> {
  const orders = await expandPack(tenantId, order);
  return processMlOrderGroup(tenantId, orders, opts);
}

/**
 * Dado el id que el vendedor ve en ML (pack_id o order_id), devuelve todas las
 * órdenes correspondientes. Sirve para pedidos cargados a mano cuyo
 * id_mercadolibre puede ser un pack o una orden suelta.
 */
async function expandPackPorId(tenantId: string, idMl: string): Promise<MlOrder[]> {
  // Intentar como pack (carrito con varios productos)
  try {
    const pack = await getPack(tenantId, idMl);
    if (pack.orders?.length) {
      const ordenes = await Promise.all(
        pack.orders.map((o) => getOrder(tenantId, String(o.id)).catch(() => null))
      );
      const validas = ordenes.filter((o): o is MlOrder => o !== null);
      if (validas.length) return validas;
    }
  } catch {
    // no es un pack
  }
  // Intentar como orden individual
  try {
    const o = await getOrder(tenantId, idMl);
    return expandPack(tenantId, o);
  } catch {
    return [];
  }
}

/**
 * Actualiza la fecha de liquidación y el estado (según el envío) de un pedido
 * ya existente del inventario, buscándolo en ML por su id_mercadolibre. No toca
 * precios ni items (sirve para pedidos cargados a mano o fuera del back-fill).
 */
export async function actualizarLiquidacionYEstado(
  tenantId: string,
  pedido: { id: string; estado: string; idMercadolibre: string | null }
): Promise<{ ok: boolean; estadoNuevo?: string; liquidacion?: Date | null; reason?: string }> {
  const idMl = pedido.idMercadolibre?.trim();
  if (!idMl) return { ok: false, reason: "sin_id_ml" };

  const orders = await expandPackPorId(tenantId, idMl);
  if (orders.length === 0) return { ok: false, reason: "no_encontrado_en_ml" };

  const fechas = await resolverFechasEnvio(tenantId, orders);
  await actualizarLiquidacion(pedido.id, fechas.liquidacion, fechas.liquidacionEstimada);

  const bonif = fechas.esFlex ? (await calcularCostosMl(tenantId, orders)).grossEnvio : 0;
  await registrarFlex(pedido.id, fechas.esFlex, bonif);

  const nuevoEstado = estadoPorEnvio(pedido.estado, fechas.enviado);
  if (nuevoEstado) {
    await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: nuevoEstado } });
    // El paquete salió: lo que estaba reservado se descuenta de verdad.
    await aplicarEstadoPedido(tenantId, pedido.id, nuevoEstado, { reasignar: false });
  }
  return {
    ok: true,
    estadoNuevo: nuevoEstado ?? pedido.estado,
    liquidacion: fechas.liquidacion,
  };
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

  // Ya existe
  if (existente) {
    // Pedido cargado a mano: respetamos lo que el usuario puso, no lo tocamos.
    if (!existente.esIntegracion) {
      return { action: "skipped_existing", pedidoId: existente.id, estado: existente.estado, warnings, reason: "pedido_manual" };
    }

    // Pedido de la integración: lo completamos/actualizamos si le falta el neto,
    // la fecha de despacho, o si la liquidación todavía es estimada (puede haber
    // pasado a entregado). Preserva estado/prioridad que el usuario haya tocado.
    const necesita =
      !existente.tieneNeto ||
      !existente.tieneFechaDespacho ||
      !existente.liquidacionCalculada ||
      !existente.flexEvaluado ||
      existente.liquidacionEstimada ||
      estadoPuedeAvanzarAEsperandoLiq(existente.estado); // re-chequear envío
    if (!necesita) {
      return { action: "skipped_existing", pedidoId: existente.id, estado: existente.estado, warnings, reason: "pedido_ya_existe" };
    }

    const fechas = await resolverFechasEnvio(tenantId, orders);
    let costos: CostosMl | null = null;
    if (!existente.tieneNeto) {
      costos = await calcularCostosMl(tenantId, orders);
      await ajustarNetoPedidoDesdeLista(existente.id, costos, fechas.despacho);
    } else if (fechas.despacho) {
      await actualizarFechaDespacho(existente.id, fechas.despacho);
    }
    // Registrar Flex (sí/no) para no reevaluarlo; calcula bonificación si lo es.
    if (fechas.esFlex && !costos) costos = await calcularCostosMl(tenantId, orders);
    await registrarFlex(existente.id, fechas.esFlex, fechas.esFlex && costos ? costos.grossEnvio : 0);
    // Siempre marcamos la liquidación (aunque sea null) para no reprocesar
    // indefinidamente pedidos sin envío.
    await actualizarLiquidacion(existente.id, fechas.liquidacion, fechas.liquidacionEstimada);
    // Si el envío ya salió, subir el estado a "esperando liquidación" (sin retroceder).
    const nuevoEstado = estadoPorEnvio(existente.estado, fechas.enviado);
    if (nuevoEstado) {
      await prisma.pedido.update({ where: { id: existente.id }, data: { estado: nuevoEstado } });
      await aplicarEstadoPedido(tenantId, existente.id, nuevoEstado, { reasignar: opts.source === "webhook" });
    }
    return { action: "updated", pedidoId: existente.id, estado: nuevoEstado ?? existente.estado, warnings, reason: "datos_ml_actualizados" };
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
    mlaOrigen: string;
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

    // ── Variantes: las que manda ML + las que la publicación lleva SIEMPRE ──
    // Muchas publicaciones no tienen variaciones en ML: el "95cm" y el "Con
    // Funda" viven sólo en el título. Esas se configuran una vez por publicación
    // (`variantesImplicitas`) y se aplican acá. Sin esto el pedido entraba con el
    // costoFab base y la billetera de fabricación quedaba corta.
    const variantesMatched: Array<Record<string, unknown>> = [];
    const idsAplicados = new Set<string>();
    let costoExtraVariantes = 0;

    const aplicarVariante = (
      v: (typeof modelo.variantes)[number],
      origen: "variacion_ml" | "implicita_publicacion",
      mlAtributo?: string,
    ) => {
      if (idsAplicados.has(v.id)) return; // no cobrar dos veces la misma variante
      idsAplicados.add(v.id);
      costoExtraVariantes += costoVariante(v);
      variantesMatched.push({
        nombre: v.nombre,
        matched: true,
        varianteId: v.id,
        costoFabAdicional: v.costoFabAdicional,
        origen,
        ...(mlAtributo ? { mlAtributo } : {}),
      });
    };

    for (const attr of oi.item.variation_attributes || []) {
      const match = buscarVariante(modelo.variantes, attr.value_name);
      if (match) {
        aplicarVariante(match, "variacion_ml", attr.name);
      } else {
        // Opción cosmética (color, personaje) que no existe como variante del
        // modelo. Se guarda para saber qué imprimir; no afecta el costo.
        variantesMatched.push({ nombre: attr.value_name, mlAtributo: attr.name, matched: false });
      }
    }

    for (const varianteId of mapeo.variantesImplicitas) {
      const v = modelo.variantes.find((x) => x.id === varianteId);
      if (v) {
        aplicarVariante(v, "implicita_publicacion");
      } else {
        warnings.push(`Variante implícita ya no existe en "${titulo}" (${mla})`);
      }
    }

    itemsData.push({
      modeloId: modelo.id,
      cantidad: oi.quantity,
      precioUnitario: oi.unit_price,
      costoUnitario: costoModelo(modelo) + costoExtraVariantes,
      ajusteManual: 0,
      variantesInfo: variantesMatched as unknown as Prisma.InputJsonValue,
      mlaOrigen: mla,
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

  const fechas = await resolverFechasEnvio(tenantId, orders);
  const fechaDespacho = fechas.despacho;

  // Neto real: descontar comisión de ML y envío del vendedor. El precio de cada
  // item pasa a ser lo que el vendedor efectivamente recibe (prorrateado).
  const costos = await calcularCostosMl(tenantId, orders);
  for (const it of itemsData) {
    it.precioUnitario = Math.round(it.precioUnitario * costos.factorNeto);
  }

  const result = await prisma.$transaction(async (tx) => {
    let cliente = await tx.cliente.findFirst({
      where: { tenantId, nombre: { equals: nombre, mode: "insensitive" }, plataforma: "mercadolibre" },
    });
    if (!cliente) {
      cliente = await tx.cliente.create({ data: { tenantId, nombre, plataforma: "mercadolibre" } });
    }

    const necesitaRevision = warnings.length > 0;
    const estadoInicial =
      principal.status === "cancelled"
        ? "CANCELADO"
        : fechas.enviado
          ? "ESPERANDO_LIQUIDACION_ML"
          : "CONFIRMADO";
    const etiquetas: string[] = [];
    if (necesitaRevision) etiquetas.push("revision_manual");
    if (fechas.esFlex) etiquetas.push("flex");
    const bonificacionFlex = fechas.esFlex ? costos.grossEnvio : 0;
    return tx.pedido.create({
      data: {
        tenantId,
        clienteId: cliente.id,
        estado: estadoInicial,
        prioridad: "ALTA",
        canalVenta: "mercadolibre",
        fechaPedido: principal.date_created ? new Date(principal.date_created) : new Date(),
        fechaEntrega: fechaDespacho ?? addBusinessDays(new Date(), 3),
        fechaLiquidacionMl: fechas.liquidacion,
        idMercadolibre: key,
        externoId: `ML-${key}`,
        contacto: buyer.nickname || null,
        notas: buildNotas(principal, key, warnings, costos, { esFlex: fechas.esFlex, bonificacionFlex }),
        etiquetas,
        origenExterno: {
          sistema: "mercadolibre",
          pack_id: principal.pack_id ?? null,
          order_ids: orders.map((o) => String(o.id)),
          status_ml: principal.status,
          total_amount: orders.reduce((s, o) => s + (o.total_amount || 0), 0),
          costos_ml: {
            precio_productos: costos.precioProductos,
            comision: costos.comision,
            envio: costos.envio,
            neto: costos.neto,
          },
          es_flex: fechas.esFlex,
          bonificacion_flex: bonificacionFlex,
          fecha_despacho_ml: fechaDespacho ? fechaDespacho.toISOString() : null,
          liquidacion_estimada: fechas.liquidacionEstimada,
          source: opts.source,
          recibido_en: new Date().toISOString(),
          warnings,
        } as Prisma.InputJsonValue,
        items: { create: itemsData },
      },
      select: { id: true, estado: true },
    });
  });

  // Pedido nuevo: que agarre el stock que le corresponde según la cola. En el
  // backfill se reparte una sola vez al final, no por pedido.
  if (opts.source === "webhook") {
    await reasignarReservas(tenantId);
  } else if (CONSUMEN_AL_CREAR.has(result.estado)) {
    // Backfill de un pedido que ya salió: no reserva nada, pero deja el estado
    // coherente para que el reparto final no lo tenga en cuenta.
    await aplicarEstadoPedido(tenantId, result.id, result.estado, { reasignar: false });
  }

  return { action: "created", pedidoId: result.id, estado: result.estado, warnings };
}

const CONSUMEN_AL_CREAR = new Set(["ESPERANDO_LIQUIDACION_ML", "ENTREGADO", "COMPLETADO"]);

/** Parsea la parte de día de un ISO y la fija al mediodía local (evita shifts). */
function parseFechaDia(iso?: string | null): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? new Date(`${m[1]}T12:00:00`) : null;
}

// Substatus de `ready_to_ship` que indican que el paquete YA salió del vendedor
// (lo dejó en el correo / lo retiró el transportista / está en tránsito). ML los
// muestra como "En camino" aunque el status todavía sea ready_to_ship.
const SUBSTATUS_DESPACHADO = new Set([
  "dropped_off",
  "picked_up",
  "in_hub",
  "in_warehouse",
  "in_transit",
  "arrived",
  "out_for_delivery",
  "soon_deliver",
  "waiting_for_withdrawal",
  "ready_for_withdrawal",
  "receiver_absent",
  "delivery_failed",
]);

/** True si el envío ya salió del vendedor (en camino o entregado). */
function envioYaSalio(status?: string, substatus?: string | null): boolean {
  if (status === "shipped" || status === "delivered" || status === "not_delivered") {
    return true;
  }
  if (status === "ready_to_ship" && substatus && SUBSTATUS_DESPACHADO.has(substatus)) {
    return true;
  }
  return false;
}

export interface FechasEnvio {
  despacho: Date | null;           // cuándo dar la etiqueta (estimated_schedule_limit)
  liquidacion: Date | null;        // entrega + 8 días corridos
  liquidacionEstimada: boolean;    // true si se basó en la entrega ESTIMADA (no real)
  enviado: boolean;                // el envío ya salió (en camino o entregado)
  esFlex: boolean;                 // logistic_type self_service (envío propio)
}

/**
 * Resuelve las fechas de envío del grupo en una sola pasada por los shipments:
 *  - despacho: el límite de despacho más temprano (deadline operativo)
 *  - liquidación: la entrega (real si todo está entregado, si no estimada) + 8 días
 */
async function resolverFechasEnvio(
  tenantId: string,
  orders: MlOrder[]
): Promise<FechasEnvio> {
  const shipmentIds = Array.from(
    new Set(orders.map((o) => o.shipping?.id).filter((id): id is number => id != null))
  );

  let despacho: Date | null = null;
  let entregaReal: Date | null = null;     // date_delivered más tardía
  let entregaEstimada: Date | null = null; // estimada más tardía
  let algunoSinEntregar = false;
  let enviado = false;                      // algún envío ya salió
  let esFlex = false;                       // logistic_type self_service

  for (const sid of shipmentIds) {
    try {
      const s = await getShipment(tenantId, sid);
      const opt = s.shipping_option;

      if (s.logistic_type === "self_service") esFlex = true;

      // El envío ya salió del vendedor (en camino o entregado)
      if (envioYaSalio(s.status, s.substatus)) enviado = true;

      const d =
        parseFechaDia(opt?.estimated_schedule_limit?.date) ??
        parseFechaDia(opt?.estimated_delivery_time?.date);
      if (d && (!despacho || d < despacho)) despacho = d;

      const entregado = parseFechaDia(s.status_history?.date_delivered);
      if (entregado) {
        if (!entregaReal || entregado > entregaReal) entregaReal = entregado;
      } else {
        algunoSinEntregar = true;
      }

      const est =
        parseFechaDia(opt?.estimated_delivery_time?.date) ??
        parseFechaDia(opt?.estimated_delivery_final?.date) ??
        parseFechaDia(opt?.estimated_delivery_limit?.date);
      if (est && (!entregaEstimada || est > entregaEstimada)) entregaEstimada = est;
    } catch {
      // sin datos para ese shipment
    }
  }

  let liquidacion: Date | null = null;
  let liquidacionEstimada = false;
  if (!algunoSinEntregar && entregaReal) {
    // Todo entregado → liquidación real
    liquidacion = addDiasCorridos(entregaReal, DIAS_LIQUIDACION);
  } else {
    // Falta entregar algo → liquidación estimada
    const base = entregaEstimada ?? entregaReal;
    if (base) {
      liquidacion = addDiasCorridos(base, DIAS_LIQUIDACION);
      liquidacionEstimada = true;
    }
  }

  return { despacho, liquidacion, liquidacionEstimada, enviado, esFlex };
}

// Orden de avance de los estados (para no retroceder al automatizar).
const ESTADO_RANK: Record<string, number> = {
  PENDIENTE_PAGO: 0,
  CONFIRMADO: 1,
  EN_PRODUCCION: 2,
  TERMINADO: 3,
  ENTREGADO: 4,
  ESPERANDO_LIQUIDACION_ML: 5,
  COMPLETADO: 6,
};

/**
 * Devuelve ESPERANDO_LIQUIDACION_ML si el envío ya salió y el estado actual es
 * anterior; si no, null (no se cambia el estado). Nunca retrocede ni toca
 * estados finales (COMPLETADO, CANCELADO, RECLAMO_ABIERTO).
 */
function estadoPorEnvio(
  estadoActual: string,
  enviado: boolean
): "ESPERANDO_LIQUIDACION_ML" | null {
  if (!enviado) return null;
  const rank = ESTADO_RANK[estadoActual];
  if (rank == null) return null; // cancelado / reclamo → no tocar
  if (rank < ESTADO_RANK.ESPERANDO_LIQUIDACION_ML) return "ESPERANDO_LIQUIDACION_ML";
  return null;
}

/**
 * True si el estado todavía es anterior a "esperando liquidación", o sea que
 * podría avanzar si el envío ya salió. Sirve para decidir si hay que volver a
 * consultar el envío en ML.
 */
export function estadoPuedeAvanzarAEsperandoLiq(estado: string): boolean {
  const rank = ESTADO_RANK[estado];
  return rank != null && rank < ESTADO_RANK.ESPERANDO_LIQUIDACION_ML;
}

export interface CostosMl {
  precioProductos: number; // lo que pagó el comprador por los productos (sin envío)
  comision: number;        // cargo por venta (sale_fee)
  envio: number;           // costo de envío a cargo del vendedor
  neto: number;            // precioProductos - comision - envio
  factorNeto: number;      // neto / precioProductos (proporción que queda)
  grossEnvio: number;      // gross_amount del envío (en Flex = bonificación de ML)
}

/**
 * Calcula lo que el vendedor realmente recibe por una compra (grupo de órdenes):
 *   neto = precio de productos − comisión de ML − envío a cargo del vendedor
 *
 * El `factorNeto` permite prorratear ese neto entre los items del pedido.
 */
export async function calcularCostosMl(
  tenantId: string,
  orders: MlOrder[]
): Promise<CostosMl> {
  let precioProductos = 0;
  let comision = 0;
  for (const o of orders) {
    for (const it of o.order_items) {
      precioProductos += it.unit_price * it.quantity;
      comision += (it.sale_fee || 0) * it.quantity;
    }
  }

  // Envío a cargo del vendedor: sumar los costos de los shipments del grupo
  // (sin duplicar si varias órdenes comparten el mismo envío).
  const shipmentIds = Array.from(
    new Set(orders.map((o) => o.shipping?.id).filter((id): id is number => id != null))
  );
  let envio = 0;
  let grossEnvio = 0;
  for (const sid of shipmentIds) {
    try {
      const costs = await getShipmentCosts(tenantId, sid);
      for (const s of costs.senders || []) envio += s.cost || 0;
      grossEnvio += costs.gross_amount || 0;
    } catch {
      // si falla traer el costo de envío, lo dejamos en 0 para ese shipment
    }
  }

  const neto = precioProductos - comision - envio;
  const factorNeto = precioProductos > 0 ? neto / precioProductos : 1;
  return { precioProductos, comision, envio, neto, factorNeto, grossEnvio };
}

const DESGLOSE_MARKER = "💰 Desglose ML:";

function buildDesglose(costos: CostosMl): string {
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
  return [
    DESGLOSE_MARKER,
    `  Precio productos: ${fmt(costos.precioProductos)}`,
    `  Comisión ML: -${fmt(costos.comision)}`,
    `  Envío (vendedor): -${fmt(costos.envio)}`,
    `  Neto recibido: ${fmt(costos.neto)}`,
  ].join("\n");
}

function buildNotas(
  order: MlOrder,
  key: string,
  warnings: string[],
  costos?: CostosMl,
  flex?: { esFlex: boolean; bonificacionFlex: number }
): string {
  const lines: string[] = [`🛒 Venta Mercado Libre: ${key}`];
  if (order.buyer.nickname) lines.push(`👤 ${order.buyer.nickname}`);
  if (order.pack_id) lines.push(`📦 Pack: ${order.pack_id}`);
  if (flex?.esFlex) {
    const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
    lines.push("", `🚚 Envío FLEX — Bonificación ML: ${fmt(flex.bonificacionFlex)}`);
  }
  if (costos) lines.push("", buildDesglose(costos));
  if (warnings.length > 0) {
    lines.push("", "⚠️ Revisar manualmente:");
    warnings.forEach((w) => lines.push(`  • ${w}`));
  }
  return lines.join("\n");
}

/**
 * Aplica el neto a un pedido cuyos items tienen el precio de LISTA (creado por
 * una versión anterior sin el cálculo). Multiplica por el factor y guarda el
 * desglose. Preserva estado/prioridad/fechas.
 */
async function ajustarNetoPedidoDesdeLista(
  pedidoId: string,
  costos: CostosMl,
  fechaDespacho?: Date | null
): Promise<void> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: true },
  });
  if (!pedido) return;

  const oe = (pedido.origenExterno ?? {}) as Record<string, unknown>;
  // Notas: quitar un desglose previo si lo hubiera y agregar el nuevo
  const notasBase = (pedido.notas || "").split(`\n\n${DESGLOSE_MARKER}`)[0].split(`\n${DESGLOSE_MARKER}`)[0].trimEnd();
  const notasNuevas = `${notasBase}\n\n${buildDesglose(costos)}`;

  await prisma.$transaction([
    ...pedido.items.map((it) =>
      prisma.itemPedido.update({
        where: { id: it.id },
        data: { precioUnitario: Math.round(it.precioUnitario * costos.factorNeto) },
      })
    ),
    prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        notas: notasNuevas,
        ...(fechaDespacho ? { fechaEntrega: fechaDespacho } : {}),
        origenExterno: {
          ...oe,
          costos_ml: {
            precio_productos: costos.precioProductos,
            comision: costos.comision,
            envio: costos.envio,
            neto: costos.neto,
          },
          ...(fechaDespacho ? { fecha_despacho_ml: fechaDespacho.toISOString() } : {}),
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
}

/** Actualiza solo la fecha de despacho de un pedido (preserva lo demás). */
async function actualizarFechaDespacho(pedidoId: string, fechaDespacho: Date): Promise<void> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { origenExterno: true },
  });
  if (!pedido) return;
  const oe = (pedido.origenExterno ?? {}) as Record<string, unknown>;
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      fechaEntrega: fechaDespacho,
      origenExterno: { ...oe, fecha_despacho_ml: fechaDespacho.toISOString() } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Registra si un pedido es Flex o no. Si lo es, agrega la etiqueta "flex" y la
 * bonificación. Siempre guarda `es_flex` (true/false) para no reevaluarlo.
 */
async function registrarFlex(
  pedidoId: string,
  esFlex: boolean,
  bonificacion: number
): Promise<void> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { etiquetas: true, origenExterno: true },
  });
  if (!pedido) return;
  const oe = (pedido.origenExterno ?? {}) as Record<string, unknown>;
  const etiquetas =
    esFlex && !pedido.etiquetas.includes("flex")
      ? [...pedido.etiquetas, "flex"]
      : pedido.etiquetas;
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      etiquetas,
      origenExterno: {
        ...oe,
        es_flex: esFlex,
        bonificacion_flex: esFlex ? bonificacion : 0,
      } as Prisma.InputJsonValue,
    },
  });
}

/** Actualiza la fecha de liquidación (si la hay) y marca si es estimada o real. */
async function actualizarLiquidacion(
  pedidoId: string,
  fecha: Date | null,
  estimada: boolean
): Promise<void> {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { origenExterno: true },
  });
  if (!pedido) return;
  const oe = (pedido.origenExterno ?? {}) as Record<string, unknown>;
  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      ...(fecha ? { fechaLiquidacionMl: fecha } : {}),
      origenExterno: { ...oe, liquidacion_estimada: estimada } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Procesa una notificación de pago. Resuelve el pedido por su pack y lo
 * re-procesa: si no existe lo crea, y si existe actualiza fechas/liquidación
 * cuando corresponde (la fecha de liquidación se deriva de la entrega, no del
 * pago, así que basta con re-procesar la orden).
 */
export async function processMlPayment(
  tenantId: string,
  paymentId: string
): Promise<ProcessResult> {
  const pago = await getPayment(tenantId, paymentId);
  if (!pago.order_id) {
    return { action: "ignored", warnings: [], reason: "payment_sin_order" };
  }
  let order: MlOrder;
  try {
    order = await getOrder(tenantId, String(pago.order_id));
  } catch {
    return { action: "ignored", warnings: [], reason: "orden_no_encontrada" };
  }
  return processMlOrder(tenantId, order, { source: "webhook" });
}
