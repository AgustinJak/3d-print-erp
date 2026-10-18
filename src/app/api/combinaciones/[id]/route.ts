export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Activar o desactivar una combinación, o completarle el SKU si no tenía.
 *
 * Una combinación nunca se borra y su SKU no cambia una vez asignado (spec 001,
 * RN-4 y RN-5): por eso el SKU sólo se acepta cuando estaba en null.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const body: { activo?: boolean; sku?: string } = await request.json();

    const c = await prisma.combinacion.findFirst({ where: { id, tenantId } });
    if (!c) return NextResponse.json({ error: "combinación no encontrada" }, { status: 404 });

    const data: { activo?: boolean; sku?: string } = {};
    if (typeof body.activo === "boolean") data.activo = body.activo;
    if (body.sku !== undefined) {
      if (c.sku) return NextResponse.json({ error: "el SKU ya está asignado y no cambia" }, { status: 400 });
      const sku = body.sku.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]*$/.test(sku)) {
        return NextResponse.json({ error: "SKU inválido: sólo letras, números y guiones" }, { status: 400 });
      }
      const ocupado = await prisma.combinacion.findUnique({ where: { tenantId_sku: { tenantId, sku } } });
      if (ocupado) return NextResponse.json({ error: `el SKU ${sku} ya es de "${ocupado.nombre}"` }, { status: 409 });
      data.sku = sku;
    }

    const actualizada = await prisma.combinacion.update({ where: { id }, data });
    return NextResponse.json(actualizada);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
