export const dynamic = "force-dynamic";

import { agregarOpciones, ErrorDeCatalogo } from "@/lib/catalogo";
import { reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/modelos/[id]/variantes  { grupo, nombres: string[] }
 *
 * Opciones nuevas en un grupo que ya existe, en lote (docs/sdd/004, spec 003, REQ-8).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body: { grupo?: string; nombres?: unknown } = await request.json().catch(() => ({}));
    if (!body.grupo) throw new ErrorDeCatalogo("falta el grupo");
    const nombres = Array.isArray(body.nombres) ? body.nombres.filter((x): x is string => typeof x === "string") : [];
    await agregarOpciones(tenantId, id, body.grupo, nombres);
    await reasignarReservas(tenantId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof ErrorDeCatalogo) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
