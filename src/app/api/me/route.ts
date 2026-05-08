export const dynamic = "force-dynamic";

import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * Devuelve datos del usuario autenticado y su tenant.
 * Usado por componentes cliente para personalizar la UI según el tenant.
 */
export async function GET() {
  try {
    const { user, tenantId } = await getAuthenticatedTenant();
    return NextResponse.json({
      userId: user.id,
      email: user.email,
      tenantId,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
