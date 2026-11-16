export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { responder } from "@/lib/api-envoltura";
import { leerParametros } from "@/lib/costos-bodega";
import { leerGastosDeVenta } from "@/lib/precios-combinacion";

/**
 * GET /api/cotizador → lo que necesita el cotizador rápido (docs/sdd/013) para calcular en la
 * pantalla: los parámetros de costo de Bodega, sus materiales y la configuración de precios del ERP.
 */
export async function GET() {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const [parametros, materiales, precios] = await Promise.all([
      leerParametros(),
      prisma.$queryRaw<Array<{ id: string; nombre: string; precio_kg: unknown; por_defecto: boolean }>>`
        SELECT id, nombre, precio_kg, por_defecto FROM bodega.materials WHERE activo ORDER BY por_defecto DESC, nombre`.catch(() => []),
      leerGastosDeVenta(tenantId),
    ]);
    return {
      parametros,
      materiales: materiales.map((m) => ({ id: m.id, nombre: m.nombre, precioKg: Number(m.precio_kg) || null, porDefecto: m.por_defecto })),
      gastos: precios.gastos,
      redondeo: precios.redondeo,
    };
  });
}
