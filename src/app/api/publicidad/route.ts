export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { resumenPublicidad } from "@/lib/publicidad-ml";
import { PERIODO_RECOMENDACIONES } from "@/lib/publicidad-recomendaciones";
import { esPeriodo, rangoDe } from "@/lib/publicidad-reglas";
import { NextRequest, NextResponse } from "next/server";

/**
 * Publicidad de ML (docs/sdd/005, spec 001): campañas y anuncios del período, con lo que deja
 * cada uno según el costo del ERP. `?periodo=7d|30d|mes|mes-pasado` (30 días si no viene).
 *
 * Las recomendaciones (spec 004) miran siempre los últimos 30 días: con otro período se pide ese
 * resumen en paralelo y se toman de ahí.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const q = request.nextUrl.searchParams.get("periodo");
    const periodo = esPeriodo(q) ? q : "30d";
    const [r, base] = await Promise.all([
      resumenPublicidad(tenantId, rangoDe(periodo)),
      periodo === PERIODO_RECOMENDACIONES ? null : resumenPublicidad(tenantId, rangoDe(PERIODO_RECOMENDACIONES)),
    ]);
    if (r.disponible && base?.disponible) r.recomendaciones = base.recomendaciones;
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
