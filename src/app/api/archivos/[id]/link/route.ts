export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { noEncontrado, responder } from "@/lib/api-envoltura";
import { linkDeArchivo } from "@/lib/tareas";

/** GET /api/archivos/:id/link?descargar=1 → link firmado (10 min) para bajarlo o verlo en el visor. (docs/sdd/012) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const descargar = new URL(request.url).searchParams.get("descargar") === "1";
    return (await linkDeArchivo(tenantId, id, descargar)) ?? noEncontrado();
  });
}
