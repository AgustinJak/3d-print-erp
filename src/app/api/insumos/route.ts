export const dynamic = "force-dynamic";

import { insumosDisponibles } from "@/lib/recetas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

/** Lo que se puede poner en una receta: fundas, exhibidores (docs/sdd/001, spec 006). */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    return NextResponse.json(await insumosDisponibles(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
