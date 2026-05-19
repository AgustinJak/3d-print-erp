export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();

    // Solo actualiza campos provistos. Si `aplicarAGrupo: true` y el gasto es
    // parte de un grupo de cuotas, propaga categoria/descripcion/billetera a
    // toda la serie (NO el monto ni la fecha — esos son por cuota).
    const aplicarAGrupo = body.aplicarAGrupo === true;

    const gasto = await prisma.gasto.findFirst({ where: { id, tenantId } });
    if (!gasto) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

    if (aplicarAGrupo && gasto.grupoCuotasId) {
      // Actualizar todo el grupo (sin monto ni fecha)
      const updates: Record<string, unknown> = {};
      if (body.categoria !== undefined) updates.categoria = body.categoria;
      if (body.descripcion !== undefined) updates.descripcion = body.descripcion || null;
      if (body.billetera !== undefined) {
        updates.billetera = body.billetera === "empresarial" ? "empresarial" : "fabricacion";
      }
      await prisma.gasto.updateMany({
        where: { tenantId, grupoCuotasId: gasto.grupoCuotasId },
        data: updates,
      });
      const updated = await prisma.gasto.findUnique({ where: { id } });
      return NextResponse.json(updated);
    }

    const parseFechaLocal = (s: string | undefined) => {
      if (!s) return undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00");
      return new Date(s);
    };

    // Solo esta cuota / gasto individual
    const updated = await prisma.gasto.update({
      where: { id, tenantId },
      data: {
        fecha: parseFechaLocal(body.fecha),
        categoria: body.categoria,
        monto: body.monto !== undefined ? parseFloat(body.monto) : undefined,
        descripcion: body.descripcion !== undefined ? (body.descripcion || null) : undefined,
        billetera:
          body.billetera !== undefined
            ? body.billetera === "empresarial"
              ? "empresarial"
              : "fabricacion"
            : undefined,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/**
 * DELETE /api/gastos/[id]?modo=individual|grupo
 *
 *  - modo=individual (default): borra solo este registro
 *  - modo=grupo: si el gasto es parte de un grupo de cuotas, borra TODAS las
 *    cuotas del grupo.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const modo = new URL(request.url).searchParams.get("modo") || "individual";

    if (modo === "grupo") {
      const gasto = await prisma.gasto.findFirst({ where: { id, tenantId } });
      if (gasto?.grupoCuotasId) {
        const result = await prisma.gasto.deleteMany({
          where: { tenantId, grupoCuotasId: gasto.grupoCuotasId },
        });
        return NextResponse.json({ ok: true, borrados: result.count });
      }
    }

    await prisma.gasto.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true, borrados: 1 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
