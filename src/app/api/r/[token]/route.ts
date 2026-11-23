export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { hojaDelRepartidor } from "@/lib/reparto";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/r/:token — lo que ve el repartidor (docs/sdd/018). PÚBLICO: pasa el middleware sin sesión;
 * el token (32 bytes al azar, se guarda sólo su hash, vence a las 48 h) es la única llave. Devuelve
 * sólo los envíos de esa hoja y lo necesario para entregar (RN-4).
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const h = await hojaDelRepartidor(token);
    if (!h) return NextResponse.json({ error: "Este link ya venció o no existe. Pedile uno nuevo a Sendero." }, { status: 410, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(h, { headers: { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex" } });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la hoja. Probá de nuevo en un rato." }, { status: 500 });
  }
}
