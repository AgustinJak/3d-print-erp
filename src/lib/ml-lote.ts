import { prisma } from "@/lib/prisma";
import { getMlAccount, searchOrders, type MlOrder } from "@/lib/mercadolibre";
import {
  actualizarLiquidacionYEstado,
  estadoPuedeAvanzarAEsperandoLiq,
  processMlOrderGroup,
} from "@/lib/mercadolibre-sync";
import { reasignarReservas } from "@/lib/reservas";
import type { Prisma } from "@/generated/prisma";

/**
 * Sincronización de Mercado Libre en lote.
 *
 * Es la misma pasada que hace el botón de Integraciones y la que corre sola por
 * cron. Vive acá y no en la ruta para que las dos hagan exactamente lo mismo:
 * si el día de mañana cambia el criterio, cambia en un solo lugar.
 *
 * Todo es idempotente. Volver a correrlo no duplica pedidos ni movimientos.
 */

export interface StatsOrdenes {
  compras: number;
  creadas: number;
  actualizadas: number;
  ya_existian: number;
  ignoradas: number;
  errores: number;
}

export interface ResultadoOrdenes {
  ok: boolean;
  motivo?: string;
  totalOrdenesMl: number;
  stats: StatsOrdenes;
  errores: string[];
  cortadoPorTiempo?: boolean;
}

/**
 * Trae las órdenes de los últimos N días y las inserta como pedidos.
 *
 * Las que ya existen se saltean, así que si se corta por timeout alcanza con
 * volver a llamarla para que siga donde quedó.
 */
export async function sincronizarOrdenes(
  tenantId: string,
  opts: { days?: number; max?: number; evento?: string; presupuestoMs?: number } = {}
): Promise<ResultadoOrdenes> {
  const days = Math.min(Math.max(opts.days ?? 30, 1), 90);
  const maxOrders = Math.min(Math.max(opts.max ?? 200, 1), 500);
  // Cada compra son varias llamadas a ML: con muchas, la función se puede pasar
  // del límite de la plataforma. Se corta antes y se sigue en la próxima pasada
  // (es idempotente, no se pierde nada).
  const limite = opts.presupuestoMs ? Date.now() + opts.presupuestoMs : Infinity;
  let cortadoPorTiempo = false;
  const stats: StatsOrdenes = {
    compras: 0,
    creadas: 0,
    actualizadas: 0,
    ya_existian: 0,
    ignoradas: 0,
    errores: 0,
  };
  const errores: string[] = [];

  const cuenta = await getMlAccount(tenantId);
  if (!cuenta) {
    return { ok: false, motivo: "sin_cuenta_ml", totalOrdenesMl: 0, stats, errores };
  }

  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();

  // 1. Todas las órdenes del rango (todas las páginas)
  const todas: MlOrder[] = [];
  let offset = 0;
  const limit = 50;
  let total = Infinity;
  while (offset < total) {
    const search = await searchOrders(tenantId, {
      sellerId: cuenta.mlUserId,
      from,
      to,
      offset,
      limit,
    });
    total = search.paging.total;
    if (search.results.length === 0) break;
    todas.push(...search.results);
    offset += limit;
  }

  // 2. Agrupar por pack (pack_id ?? order.id) → un pedido por compra
  const grupos = new Map<string, MlOrder[]>();
  for (const o of todas) {
    const key = String(o.pack_id ?? o.id);
    const arr = grupos.get(key);
    if (arr) arr.push(o);
    else grupos.set(key, [o]);
  }
  stats.compras = grupos.size;

  // 3. Procesar cada compra
  let procesadas = 0;
  for (const [key, orders] of grupos) {
    if (procesadas >= maxOrders) break;
    if (Date.now() > limite) { cortadoPorTiempo = true; break; }
    procesadas++;
    try {
      const result = await processMlOrderGroup(tenantId, orders, { source: "backfill" });
      switch (result.action) {
        case "created": stats.creadas++; break;
        case "updated": stats.actualizadas++; break;
        case "skipped_existing": stats.ya_existian++; break;
        case "ignored": stats.ignoradas++; break;
      }
    } catch (e) {
      stats.errores++;
      const msg = e instanceof Error ? e.message : "error";
      if (errores.length < 20) errores.push(`Compra ${key}: ${msg}`.slice(0, 200));
    }
  }

  // Un solo reparto de stock al final: durante el lote no se reasigna por
  // pedido (sería el mismo cálculo N veces).
  await reasignarReservas(tenantId);

  await prisma.webhookLog
    .create({
      data: {
        tenantId,
        origen: "mercadolibre",
        evento: opts.evento ?? "backfill",
        estado: stats.errores > 0 ? "error" : "ok",
        errorMsg: `creadas:${stats.creadas} actualizadas:${stats.actualizadas} ya_existian:${stats.ya_existian} ignoradas:${stats.ignoradas} errores:${stats.errores}`,
        payload: { days, maxOrders, stats, cortadoPorTiempo, detalleErrores: errores } as unknown as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});

  return { ok: true, totalOrdenesMl: todas.length, stats, errores, cortadoPorTiempo };
}

export interface StatsLiquidaciones {
  revisados: number;
  actualizados: number;
  ya_resueltos: number;
  no_encontrados: number;
  errores: number;
}

export interface ResultadoLiquidaciones {
  ok: boolean;
  motivo?: string;
  candidatos: number;
  stats: StatsLiquidaciones;
  errores: string[];
  cortadoPorTiempo?: boolean;
}

/**
 * Revisa los pedidos de ML que todavía no tienen la liquidación resuelta y les
 * asigna fecha + estado según el envío. Es lo que hace avanzar un pedido a
 * "esperando liquidación" cuando el paquete sale — y lo que descuenta su stock.
 *
 * Los que ya tienen liquidación real se saltean sin llamar a ML.
 */
export async function actualizarLiquidaciones(
  tenantId: string,
  opts: { max?: number; evento?: string; presupuestoMs?: number } = {}
): Promise<ResultadoLiquidaciones> {
  const max = Math.min(Math.max(opts.max ?? 40, 1), 300);
  const limite = opts.presupuestoMs ? Date.now() + opts.presupuestoMs : Infinity;
  let cortadoPorTiempo = false;
  const stats: StatsLiquidaciones = {
    revisados: 0,
    actualizados: 0,
    ya_resueltos: 0,
    no_encontrados: 0,
    errores: 0,
  };
  const errores: string[] = [];

  const cuenta = await getMlAccount(tenantId);
  if (!cuenta) {
    return { ok: false, motivo: "sin_cuenta_ml", candidatos: 0, stats, errores };
  }

  const candidatos = await prisma.pedido.findMany({
    where: {
      tenantId,
      idMercadolibre: { not: null },
      estado: {
        in: ["CONFIRMADO", "EN_PRODUCCION", "TERMINADO", "ENTREGADO", "ESPERANDO_LIQUIDACION_ML"],
      },
    },
    select: {
      id: true,
      estado: true,
      idMercadolibre: true,
      fechaLiquidacionMl: true,
      origenExterno: true,
    },
    orderBy: { fechaPedido: "desc" },
  });

  for (const p of candidatos) {
    if (stats.actualizados >= max) break;
    if (Date.now() > limite) { cortadoPorTiempo = true; break; }

    // Saltear solo si ya tiene liquidación REAL, el estado ya no puede avanzar
    // y ya se evaluó si es Flex (sino hay que re-chequear el envío).
    const oe = (p.origenExterno ?? {}) as Record<string, unknown>;
    const liquidacionEstimada = oe.liquidacion_estimada === true;
    const tieneReal = p.fechaLiquidacionMl != null && !liquidacionEstimada && "liquidacion_estimada" in oe;
    const flexEvaluado = "es_flex" in oe;
    if (tieneReal && !estadoPuedeAvanzarAEsperandoLiq(p.estado) && flexEvaluado) {
      stats.ya_resueltos++;
      continue;
    }

    stats.revisados++;
    try {
      const res = await actualizarLiquidacionYEstado(tenantId, {
        id: p.id,
        estado: p.estado,
        idMercadolibre: p.idMercadolibre,
      });
      if (res.ok) stats.actualizados++;
      else if (res.reason === "no_encontrado_en_ml") stats.no_encontrados++;
    } catch (e) {
      stats.errores++;
      const msg = e instanceof Error ? e.message : "error";
      if (errores.length < 20) errores.push(`Pedido ${p.idMercadolibre}: ${msg}`.slice(0, 200));
    }
  }

  // Los pedidos que pasaron a "en camino" ya descontaron su stock; queda
  // repartir lo que se haya liberado entre los que siguen abiertos.
  await reasignarReservas(tenantId);

  await prisma.webhookLog
    .create({
      data: {
        tenantId,
        origen: "mercadolibre",
        evento: opts.evento ?? "actualizar_liquidaciones",
        estado: stats.errores > 0 ? "error" : "ok",
        errorMsg: `actualizados:${stats.actualizados} ya_resueltos:${stats.ya_resueltos} no_encontrados:${stats.no_encontrados} errores:${stats.errores}`,
        payload: { max, stats, cortadoPorTiempo, detalleErrores: errores } as unknown as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});

  return { ok: true, candidatos: candidatos.length, stats, errores, cortadoPorTiempo };
}
