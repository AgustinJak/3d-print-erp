export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { campanasConCosto, rangoMes } from "@/lib/ml-publicidad";
import { guardarPublicidad } from "@/lib/ventas-terceros";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";

/**
 * Publicidad de Mercado Libre del mes, separando las campañas de Shay.
 *
 * La cuenta es una sola: para ML todas las campañas son del mismo anunciante.
 * Cuáles son de Shay lo decide el usuario una vez, y queda guardado en la
 * config del tenant para los meses siguientes.
 *
 * GET  → campañas del mes con su costo, y cuáles están marcadas como de Shay.
 * POST → guarda la selección y escribe la suma en la publicidad del mes.
 */

const CLAVE = "campanasShay";

async function leerSeleccion(tenantId: string): Promise<number[]> {
  const cfg = await prisma.configTenant.findUnique({ where: { tenantId } });
  const data = (cfg?.data ?? {}) as Record<string, unknown>;
  const ids = data[CLAVE];
  return Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : [];
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { searchParams } = new URL(request.url);
    const anio = parseInt(searchParams.get("anio") || "", 10);
    const mes = parseInt(searchParams.get("mes") || "", 10);
    if (!anio || !mes) return NextResponse.json({ error: "anio y mes requeridos" }, { status: 400 });

    const { desde, hasta } = rangoMes(anio, mes);
    const r = await campanasConCosto(tenantId, desde, hasta);
    if (!r.ok) return NextResponse.json({ disponible: false, motivo: r.motivo });

    return NextResponse.json({
      disponible: true,
      campanas: r.campanas,
      seleccionadas: await leerSeleccion(tenantId),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { anio, mes, seleccionadas } = await request.json();
    if (!anio || !mes) return NextResponse.json({ error: "anio y mes requeridos" }, { status: 400 });

    const ids: number[] = Array.isArray(seleccionadas)
      ? seleccionadas.map(Number).filter(Number.isFinite)
      : [];

    // La selección se guarda una vez y vale para todos los meses.
    const cfg = await prisma.configTenant.findUnique({ where: { tenantId } });
    const data = { ...((cfg?.data ?? {}) as Record<string, unknown>), [CLAVE]: ids };
    await prisma.configTenant.upsert({
      where: { tenantId },
      create: { tenantId, data: data as Prisma.InputJsonValue },
      update: { data: data as Prisma.InputJsonValue },
    });

    const { desde, hasta } = rangoMes(Number(anio), Number(mes));
    const r = await campanasConCosto(tenantId, desde, hasta);
    if (!r.ok) return NextResponse.json({ error: r.motivo }, { status: 400 });

    const total = r.campanas
      .filter((c) => ids.includes(c.id))
      .reduce((a, c) => a + c.costo, 0);

    const cierre = await guardarPublicidad(
      tenantId,
      Number(anio),
      Number(mes),
      Math.round(total * 100) / 100
    );

    return NextResponse.json({ cierre, total, campanas: r.campanas, seleccionadas: ids });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
