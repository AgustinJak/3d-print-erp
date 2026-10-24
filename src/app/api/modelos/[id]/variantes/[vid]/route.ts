export const dynamic = "force-dynamic";

import { actualizarVariante, borrarVariante, ErrorDeCatalogo, renombrarVariante } from "@/lib/catalogo";
import { prisma } from "@/lib/prisma";
import { reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Una opción, por id (docs/sdd/004, spec 003).
 *
 *   PATCH  { nombre?, precioAdicional?, costoFabAdicional?, costoInsumosAdicional?, notas? }
 *   DELETE
 *
 * Renombrar la conserva: sus combinaciones, filas y mapeos siguen (REQ-7).
 */

type Params = { params: Promise<{ id: string; vid: string }> };

function error(e: unknown) {
  if (e instanceof NextResponse) return e;
  if (e instanceof ErrorDeCatalogo) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "error";
  return NextResponse.json({ error: msg }, { status: 500 });
}

/** La opción tiene que ser de este producto: la ruta lo dice y no se confía en el id solo. */
async function delProducto(tenantId: string, id: string, vid: string) {
  const v = await prisma.varianteModelo.findFirst({ where: { id: vid, modeloId: id, modelo: { tenantId } }, select: { id: true } });
  if (!v) throw new ErrorDeCatalogo("opción no encontrada", 404);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id, vid } = await params;
    await delProducto(tenantId, id, vid);
    const body: {
      nombre?: string;
      precioAdicional?: number;
      costoFabAdicional?: number;
      costoInsumosAdicional?: number;
      notas?: string | null;
    } = await request.json().catch(() => ({}));
    if (body.nombre !== undefined) await renombrarVariante(tenantId, vid, body.nombre);
    await actualizarVariante(tenantId, vid, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id, vid } = await params;
    await delProducto(tenantId, id, vid);
    const r = await borrarVariante(tenantId, vid);
    await reasignarReservas(tenantId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return error(e);
  }
}
