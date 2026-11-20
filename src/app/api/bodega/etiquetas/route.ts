export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { ErrorDeEtiquetas, etiquetasZpl, validarIds } from "@/lib/etiquetas-ml";
import { getTenantDeBodega } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/bodega/etiquetas?envios=1,2,3 — el ZPL de esas etiquetas de ML, para que la Bodega las
 * imprima sin bajar archivos (docs/sdd/017, TASK-004). Con la sesión de la Bodega en Bearer.
 *
 * RN-1: la respuesta tiene datos del comprador. `no-store`, y nada se loguea. Los envíos sólo pueden
 * ser de la cuenta Sendero 3D: es su token el que le pide la etiqueta a ML, y ML no da etiquetas de
 * otro vendedor.
 */
export async function GET(request: NextRequest) {
  try {
    await getTenantDeBodega(request);
    const ids = validarIds(request.nextUrl.searchParams.get("envios"));
    if (!ids) return NextResponse.json({ error: "envios tiene que ser una lista de números de envío" }, { status: 400 });
    const { zpl } = await etiquetasZpl(ids);
    if (!zpl.includes("^XA")) return NextResponse.json({ error: "Mercado Libre no devolvió etiquetas para esos envíos" }, { status: 502 });
    // Los mismos bytes que mandó ML (latin1): si se reencodea a UTF-8, un acento sin escapar cambia.
    return new NextResponse(new Uint8Array(Buffer.from(zpl, "latin1")), {
      headers: { "Content-Type": "text/plain; charset=iso-8859-1", "Cache-Control": "no-store, private" },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof ErrorDeEtiquetas) return NextResponse.json({ error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
    // Sin el detalle: un error de acá nunca debería llevar contenido de la etiqueta.
    console.error("[bodega/etiquetas] falló pedir etiquetas a ML");
    return NextResponse.json({ error: "No se pudieron bajar las etiquetas" }, { status: 500 });
  }
}
