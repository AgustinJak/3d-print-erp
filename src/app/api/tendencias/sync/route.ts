export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { sincronizarTendencias } from "@/lib/tendencias-sync";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * POST /api/tendencias/sync — "Actualizar" en Tendencias: búsquedas de ML y calendario (docs/sdd/016).
 * Lo mismo corre solo cada día en /api/cron/tendencias.
 */
export async function POST() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Tendencias es de Sendero 3D" }, { status: 403 });
    return NextResponse.json(await sincronizarTendencias());
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
