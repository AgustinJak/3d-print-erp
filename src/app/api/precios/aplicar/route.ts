export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { aplicarPrecios, ErrorDePrecios, type Canal } from "@/lib/precios-propuesta";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Aplica precios aprobados en un canal (spec 004, REQ-3). Es la única forma de cambiar un precio
 * desde el ERP: no hay cron ni disparo desde Bodega.
 *
 *   POST { canal, filas: [{ clave, precio }], confirmado: true, confirmadoGrandes? }
 *
 * `precio` es el que vio Agustín; si la propuesta de ahora da otro, esa fila no se manda.
 * `confirmadoGrandes` hace falta si alguna fila cambia más de 30 % (RN-4).
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const body: { canal?: string; filas?: unknown; confirmado?: boolean; confirmadoGrandes?: boolean } = await request.json().catch(() => ({}));
    if (body.confirmado !== true) throw new ErrorDePrecios("falta confirmar");
    if (body.canal !== "mercadolibre" && body.canal !== "shop" && body.canal !== "erp") throw new ErrorDePrecios("canal tiene que ser mercadolibre, shop o erp");
    const filas = Array.isArray(body.filas)
      ? body.filas.filter((f): f is { clave: string; precio: number } => typeof f?.clave === "string" && typeof f?.precio === "number")
      : [];
    if (!filas.length) throw new ErrorDePrecios("no hay filas para aplicar");
    const resultados = await aplicarPrecios(tenantId, user.email ?? user.id, body.canal as Canal, filas, body.confirmadoGrandes === true);
    return NextResponse.json({ resultados });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof ErrorDePrecios) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
