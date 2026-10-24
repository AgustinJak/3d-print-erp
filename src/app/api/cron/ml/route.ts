export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { esBaseCaida, MENSAJE_BASE_CAIDA } from "@/lib/base-caida";
import { altasAutomaticas } from "@/lib/altas-bodega";
import { aplicarCostosSiCambio } from "@/lib/sincronizar-costos";
import { actualizarLiquidaciones, sincronizarOrdenes } from "@/lib/ml-lote";
import { NextRequest, NextResponse } from "next/server";

/**
 * Sincronización automática con Mercado Libre.
 *
 * Corre sola (cron de Vercel) para que los pedidos entren sin que nadie abra la
 * página. Es la red de seguridad del webhook: si ML no notifica, o la
 * notificación se pierde, acá se recupera igual — como mucho con el retraso del
 * intervalo del cron.
 *
 * Mira una ventana corta (3 días) porque lo viejo ya está cargado; para traer
 * historial está el back-fill manual de Integraciones.
 *
 * Se protege con CRON_SECRET: Vercel manda `Authorization: Bearer $CRON_SECRET`
 * en sus llamadas de cron. Sin la variable configurada, no atiende a nadie —
 * antes que quedar abierto, prefiere no funcionar.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  // La función tiene 60s. Se reparten con margen: primero las órdenes (que es
  // lo que hace entrar ventas nuevas), después los envíos. Lo que no entre en
  // el presupuesto se recupera en la pasada siguiente.
  const arranque = Date.now();
  const restante = (reserva: number) => Math.max(3_000, 50_000 - (Date.now() - arranque) - reserva);

  // Una pasada por cada cuenta conectada (hoy: sendero3d).
  //
  // Si la base no responde, esta es la primera consulta en enterarse. Antes la excepción se
  // escapaba y Next contestaba 500 sin cuerpo: el aviso de GitHub decía "HTTP 500" y nada más.
  let cuentas: Array<{ tenantId: string }>;
  try {
    cuentas = await prisma.cuentaMercadolibre.findMany({ select: { tenantId: true } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (esBaseCaida(e)) {
      // Prisma mete un fragmento de código en el mensaje: alcanza con la última línea.
      const detalle = msg.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? "";
      return NextResponse.json({ error: MENSAJE_BASE_CAIDA, detalle: detalle.slice(0, 300) }, { status: 503 });
    }
    return NextResponse.json({ error: msg.slice(0, 500) }, { status: 500 });
  }
  const resultados: Array<Record<string, unknown>> = [];

  for (const { tenantId } of cuentas) {
    try {
      const ordenes = await sincronizarOrdenes(tenantId, {
        days: 2,
        max: 40,
        evento: "cron_ordenes",
        presupuestoMs: restante(20_000), // deja aire para las liquidaciones
      });
      const liquidaciones = await actualizarLiquidaciones(tenantId, {
        max: 20,
        evento: "cron_liquidaciones",
        presupuestoMs: restante(0),
      });
      // Un modelo nuevo de Bodega también entra por acá. Las otras dos puertas
      // —los GET de /api/stock y /api/cambios— dependen de que alguien tenga el
      // ERP abierto: una pieza creada a la noche se quedaba esperando hasta que
      // alguien mirara. Acá entra sola aunque no haya nadie.
      //
      // `altasAutomaticas` arranca con un conteo de una sola consulta y se va
      // enseguida cuando no hay nada pendiente, que es casi siempre.
      const altas = await altasAutomaticas(tenantId).catch((e) => {
        console.error("[cron/ml] altas de Bodega:", e);
        return null;
      });
      // Y los costos de Bodega, sin aprobación (docs/sdd/004, spec 007).
      await aplicarCostosSiCambio(tenantId).catch((e) => {
        console.error("[cron/ml] costos de Bodega:", e);
      });

      resultados.push({
        tenantId,
        ordenes: ordenes.stats,
        liquidaciones: liquidaciones.stats,
        altasBodega: altas ? altas.creados.length + altas.mapeados.length : null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error";
      resultados.push({ tenantId, error: msg });
      await prisma.webhookLog
        .create({
          data: {
            tenantId,
            origen: "mercadolibre",
            evento: "cron",
            estado: "error",
            errorMsg: msg.slice(0, 500),
            payload: {},
          },
        })
        .catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, cuentas: cuentas.length, resultados });
}
