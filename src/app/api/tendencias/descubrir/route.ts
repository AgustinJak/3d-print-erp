export const dynamic = "force-dynamic";

import { armarDescubrir } from "@/lib/tendencias-descubrir";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

/** GET /api/tendencias/descubrir — lo que sube en las categorías elegidas de ML (docs/sdd/016). */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    if (tenantId !== "sendero3d") return NextResponse.json({ fotoMl: null, conComparacion: false, vidrieras: [], destacadas: [] });
    return NextResponse.json(await armarDescubrir());
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
