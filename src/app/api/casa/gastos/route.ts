export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

const GRUPOS = new Set(["fijo", "ocio", "inversion"]);
const REPARTOS = new Set(["proporcional", "mitad", "personal"]);

function limpiar(body: Record<string, unknown>) {
  const grupo = GRUPOS.has(String(body.grupo)) ? String(body.grupo) : "ocio";
  const reparto = REPARTOS.has(String(body.reparto)) ? String(body.reparto) : "proporcional";
  const personaPaga =
    reparto === "personal" ? (body.personaPaga === "tai" ? "tai" : "sendero") : null;
  return {
    grupo,
    nombre: String(body.nombre || "").trim() || "Gasto",
    monto: parseFloat(String(body.monto)) || 0,
    reparto,
    personaPaga,
  };
}

/** Crea un gasto del mes. */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const mes = parseInt(body.mes, 10);
    const anio = parseInt(body.anio, 10);
    if (!mes || !anio) {
      return NextResponse.json({ error: "mes/anio requeridos" }, { status: 400 });
    }
    const gasto = await prisma.casaGasto.create({
      data: { tenantId, mes, anio, ...limpiar(body) },
    });
    return NextResponse.json(gasto, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/** Edita un gasto existente. */
export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const gasto = await prisma.casaGasto.updateMany({
      where: { id, tenantId },
      data: limpiar(body),
    });
    if (gasto.count === 0) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/** Elimina un gasto. */
export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    await prisma.casaGasto.deleteMany({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
