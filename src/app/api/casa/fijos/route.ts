export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

const REPARTOS = new Set(["proporcional", "mitad", "personal"]);

function limpiar(body: Record<string, unknown>) {
  const reparto = REPARTOS.has(String(body.reparto)) ? String(body.reparto) : "proporcional";
  const personaPaga =
    reparto === "personal" ? (body.personaPaga === "tai" ? "tai" : "sendero") : null;
  return {
    nombre: String(body.nombre || "").trim() || "Fijo",
    monto: parseFloat(String(body.monto)) || 0,
    reparto,
    personaPaga,
  };
}

/** Lista la plantilla de fijos. */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const fijos = await prisma.casaFijo.findMany({
      where: { tenantId },
      orderBy: [{ activo: "desc" }, { orden: "asc" }],
    });
    return NextResponse.json(fijos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/** Crea un fijo en la plantilla. */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const max = await prisma.casaFijo.aggregate({ where: { tenantId }, _max: { orden: true } });
    const fijo = await prisma.casaFijo.create({
      data: { tenantId, orden: (max._max.orden ?? 0) + 1, ...limpiar(body) },
    });
    return NextResponse.json(fijo, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/** Edita un fijo (o lo activa/desactiva). */
export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const data: Record<string, unknown> =
      "activo" in body && Object.keys(body).length <= 2
        ? { activo: Boolean(body.activo) }
        : limpiar(body);
    const res = await prisma.casaFijo.updateMany({ where: { id, tenantId }, data });
    if (res.count === 0) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/** Elimina un fijo de la plantilla. */
export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    await prisma.casaFijo.deleteMany({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
