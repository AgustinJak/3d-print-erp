export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { guardarMargen, simularMargen } from "@/lib/precios-config";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * El margen de varios productos a la vez (docs/sdd/006, spec 002). Sin `aplicar`, cómo quedan sus
 * combinaciones antes y después; con `aplicar`, lo guarda. No publica precios: eso es "Aplicar" en
 * cada canal. `margen` null = volver al general.
 */
const Cuerpo = z.object({
  modeloIds: z.array(z.string().min(1)).min(1).max(300),
  margen: z.number().min(5).max(80).nullable(),
  aplicar: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "El margen tiene que ir de 5 a 80" }, { status: 400 });
    const { modeloIds, margen, aplicar } = cuerpo.data;
    if (!aplicar) return NextResponse.json({ filas: await simularMargen(tenantId, modeloIds, margen) });
    return NextResponse.json({ guardados: await guardarMargen(tenantId, modeloIds, margen) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
