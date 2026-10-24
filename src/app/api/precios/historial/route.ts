export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** El historial de precios aplicados (spec 004, REQ-4). `?canal=&clave=` filtran; los últimos 200. */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const canal = request.nextUrl.searchParams.get("canal");
    const clave = request.nextUrl.searchParams.get("clave");
    const cambios = await prisma.cambioPrecio.findMany({
      where: { tenantId, ...(canal ? { canal } : {}), ...(clave ? { clave } : {}) },
      orderBy: { creadoEn: "desc" },
      take: 200,
    });
    return NextResponse.json(cambios);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
