export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { enviosParaDespachar } from "@/lib/envios-para-despachar";
import { getTenantDeBodega } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/bodega/envios — lo que hay que despachar de ML, para Etiquetas de la Bodega (docs/sdd/017).
 * Lo llama la Bodega con su sesión en `Authorization: Bearer` (pasa el middleware sin cookie). No
 * devuelve datos del comprador (RN-1).
 */
export async function GET(request: NextRequest) {
  try {
    await getTenantDeBodega(request);
    return NextResponse.json(await enviosParaDespachar(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
