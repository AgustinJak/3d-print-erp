export const dynamic = "force-dynamic";

import { cuentasMl } from "@/lib/mercadolibre";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * GET /api/ml/cuentas — las cuentas de Mercado Libre del negocio, por nombre (docs/sdd/011): lo que
 * usa el selector de cuenta de cada sección. Sin tokens ni datos de la conexión.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const cuentas = await cuentasMl(tenantId);
    const principal = cuentas.find((c) => c.principal);
    return NextResponse.json({
      principal: principal ? { id: principal.id, nombre: principal.nombre ?? "Sendero 3D" } : null,
      otras: cuentas.filter((c) => !c.principal).map((c) => ({ id: c.id, nombre: c.nombre ?? c.nickname ?? "Otra cuenta" })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
