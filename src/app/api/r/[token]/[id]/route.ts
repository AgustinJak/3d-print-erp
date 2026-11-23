export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { marcarDesdeLink } from "@/lib/reparto";
import { NextRequest, NextResponse } from "next/server";

/** POST /api/r/:token/:id { estado, motivo? } — lo marca el repartidor (docs/sdd/018). PÚBLICO, con el token. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const b = (await request.json().catch(() => null)) as { estado?: unknown; motivo?: unknown } | null;
    const r = await marcarDesdeLink(token, id, b ?? {});
    return "error" in r ? NextResponse.json({ error: r.error }, { status: r.status }) : NextResponse.json(r);
  } catch {
    return NextResponse.json({ error: "No se pudo guardar. Probá de nuevo." }, { status: 500 });
  }
}
