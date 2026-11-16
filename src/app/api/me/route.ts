export const dynamic = "force-dynamic";

import { getAuthenticatedTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

/**
 * Devuelve datos del usuario autenticado y su tenant.
 * Usado por componentes cliente para personalizar la UI según el tenant, y por la barra de arriba
 * para mostrar quién tiene la sesión iniciada (Agustín o Taiel comparten el mismo negocio).
 */
export async function GET() {
  try {
    const { user, tenantId } = await getAuthenticatedTenant();
    const perfil = await prisma.perfil.findUnique({ where: { userId: user.id }, select: { nombre: true } }).catch(() => null);
    return NextResponse.json({
      userId: user.id,
      email: user.email,
      nombre: perfil?.nombre ?? null,
      tenantId,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
