export const dynamic = "force-dynamic";

import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * POST /api/integraciones/generate-secret
 *
 * Genera un secret seguro de 64 caracteres hex (256 bits).
 * NO lo guarda — el usuario debe configurarlo en Vercel y en el shop manualmente.
 */
export async function POST() {
  try {
    await getAuthenticatedTenant(); // Solo autenticados pueden generar
    const secret = `whsec_${randomBytes(32).toString("hex")}`;
    return NextResponse.json({ secret });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
