export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { sembrarMapeosMl } from "@/lib/mapeo-ml";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Siembra el mapeo de Mercado Libre desde las publicaciones conocidas
 * (docs/sdd/001, spec 004, REQ-6). Lee cada publicación en ML, una por una, sin
 * escribir nada allá. Idempotente.
 *
 * `?simular=1` dice qué haría sin escribir. `?mla=MLA…` (repetible) limita a
 * esas publicaciones; `?rehacer=1` vuelve a resolver las claves que nadie tocó a
 * mano.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const sp = request.nextUrl.searchParams;
    const mlas = sp.getAll("mla").filter(Boolean);
    const r = await sembrarMapeosMl(tenantId, {
      simular: sp.get("simular") === "1",
      rehacer: sp.get("rehacer") === "1",
      ...(mlas.length > 0 ? { mlas } : {}),
    });
    return NextResponse.json({ simulado: sp.get("simular") === "1", ...r });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
