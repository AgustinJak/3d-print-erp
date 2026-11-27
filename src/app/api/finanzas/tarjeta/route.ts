export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import type { ParteTarjeta } from "@/lib/retirable";
import { NextRequest, NextResponse } from "next/server";

/**
 * Los resúmenes de la tarjeta de Mercado Pago, cargados a mano (docs/sdd/019): no hay API.
 * GET    → los últimos 6.
 * POST   → { cierre, vencimiento, total, partes: [{ socio, monto }] } crea o reemplaza el de ese cierre.
 * PATCH  → { id, pagado?, partes? } marca pagado o que un socio depositó su parte.
 * DELETE → ?id=
 */

const esDia = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const fecha = (d: string) => new Date(`${d}T12:00:00Z`);

function partesValidas(x: unknown): ParteTarjeta[] | null {
  if (!Array.isArray(x)) return null;
  const out: ParteTarjeta[] = [];
  for (const p of x as Array<Record<string, unknown>>) {
    const monto = Number(p?.monto);
    if (typeof p?.socio !== "string" || !p.socio.trim() || !Number.isFinite(monto) || monto < 0) return null;
    if (monto > 0) out.push({ socio: p.socio.trim(), monto, depositado: p.depositado === true });
  }
  return out;
}

async function tenant() {
  const { tenantId } = await getAuthenticatedTenantNonDemo();
  if (tenantId !== "sendero3d") throw NextResponse.json({ error: "Es de Sendero 3D" }, { status: 403 });
  return tenantId;
}

const error = (e: unknown) => (e instanceof NextResponse ? e : NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 }));

export async function GET() {
  try {
    const tenantId = await tenant();
    return NextResponse.json(await prisma.resumenTarjeta.findMany({ where: { tenantId }, orderBy: { cierre: "desc" }, take: 6 }));
  } catch (e) {
    return error(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await tenant();
    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const total = Number(b?.total);
    const partes = partesValidas(b?.partes ?? []);
    if (!b || !esDia(b.cierre) || !esDia(b.vencimiento) || !Number.isFinite(total) || total <= 0 || !partes) return NextResponse.json({ error: "Faltan el cierre, el vencimiento o el total" }, { status: 400 });
    if (partes.reduce((s, p) => s + p.monto, 0) > total) return NextResponse.json({ error: "Las partes personales suman más que el total" }, { status: 400 });
    const data = { vencimiento: fecha(b.vencimiento), total, partes: partes as unknown as object, notas: typeof b.notas === "string" ? b.notas : null };
    const r = await prisma.resumenTarjeta.upsert({
      where: { tenantId_cierre: { tenantId, cierre: fecha(b.cierre) } },
      create: { tenantId, cierre: fecha(b.cierre), ...data },
      update: data,
    });
    return NextResponse.json(r);
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const tenantId = await tenant();
    const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || typeof b.id !== "string") return NextResponse.json({ error: "Falta el resumen" }, { status: 400 });
    const existe = await prisma.resumenTarjeta.findFirst({ where: { id: b.id, tenantId } });
    if (!existe) return NextResponse.json({ error: "No existe ese resumen" }, { status: 404 });
    const data: { pagado?: boolean; partes?: object } = {};
    if (typeof b.pagado === "boolean") data.pagado = b.pagado;
    if ("partes" in b) {
      const partes = partesValidas(b.partes);
      if (!partes) return NextResponse.json({ error: "Las partes no son válidas" }, { status: 400 });
      data.partes = partes as unknown as object;
    }
    return NextResponse.json(await prisma.resumenTarjeta.update({ where: { id: b.id }, data }));
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = await tenant();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta el resumen" }, { status: 400 });
    const r = await prisma.resumenTarjeta.deleteMany({ where: { id, tenantId } });
    return NextResponse.json({ ok: r.count === 1 });
  } catch (e) {
    return error(e);
  }
}
