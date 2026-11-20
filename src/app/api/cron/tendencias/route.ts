export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { sincronizarTendencias } from "@/lib/tendencias-sync";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron diario de Tendencias (docs/sdd/016): búsquedas de ML y calendario. Con CRON_SECRET, igual
 * que /api/cron/ml: sin la variable no atiende a nadie.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await sincronizarTendencias());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
