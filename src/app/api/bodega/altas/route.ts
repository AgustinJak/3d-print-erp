export const dynamic = "force-dynamic";

import { altasAutomaticas, candidatosDeBodega, crearDesdeBodega, descartarDeBodega, ultimaSubidaDeBodega } from "@/lib/altas-bodega";
import { aplicarCostosSiCambio } from "@/lib/sincronizar-costos";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Los modelos de Bodega que todavía no están en el inventario.
 *
 * El alta de lo nuevo pasa sola (ver `altasAutomaticas`); esto es para el
 * backlog: las piezas que ya estaban en Bodega antes de encender esto, donde
 * conviven productos reales con años de pruebas. Se traen o se descartan de a
 * uno, y lo descartado no vuelve a aparecer.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await candidatosDeBodega(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json().catch(() => ({}));

    // El botón "Traer de Bodega": lo mismo que pasa solo, ahora, y con el resultado a la vista.
    // Los costos también: una pieza recién traída entra con lo que sabía Bodega en ese momento.
    if (body?.accion === "traer") {
      const r = await altasAutomaticas(tenantId);
      const costos = await aplicarCostosSiCambio(tenantId);
      return NextResponse.json({ ok: true, ...r, costosActualizados: costos.modelos, ultimaSubida: await ultimaSubidaDeBodega() });
    }

    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "no se indicó ningún modelo" }, { status: 400 });
    }

    if (body?.accion === "ignorar") {
      await descartarDeBodega(tenantId, ids);
      return NextResponse.json({ ok: true, ignorados: ids.length });
    }

    return NextResponse.json({ ok: true, ...(await crearDesdeBodega(tenantId, ids)) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
