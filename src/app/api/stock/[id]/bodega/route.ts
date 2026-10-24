export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * PUT /api/stock/[id]/bodega  { bodegaModelId: string | null }
 *
 * Engancha una fila de stock con su pieza de Bodega desde la página del producto
 * (docs/sdd/004, spec 003, RN-4). Hasta acá sólo se podía desde Bodega
 * (Configuración › Stock del ERP), que llama a la misma función: si la pieza
 * estaba en otra fila, la libera de esa y devuelve cuál quedó suelta.
 *
 * `bodega_mapear_modelo` es `security definer` y no sabe de tenants: por eso se
 * verifica antes que la fila es de quien pregunta.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const body: { bodegaModelId?: string | null } = await request.json().catch(() => ({}));
    const bodegaModelId = typeof body.bodegaModelId === "string" && body.bodegaModelId.trim() ? body.bodegaModelId.trim() : null;

    const fila = await prisma.stock.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!fila) return NextResponse.json({ error: "fila de stock no encontrada" }, { status: 404 });

    const [r] = await prisma.$queryRaw<Array<{ r: { liberado: string | null } }>>`
      SELECT public.bodega_mapear_modelo(${id}, ${bodegaModelId}) AS r
    `;
    return NextResponse.json({ ok: true, bodegaModelId, liberado: r?.r?.liberado ?? null });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    // La función rechaza piezas que no existen: es un dato mal elegido, no una falla.
    const status = /inexistente/.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
