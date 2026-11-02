import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";

/**
 * La entrada desde Bodega (docs/sdd/006, spec 005): la ficha de una pieza ya no muestra precios y
 * linkea acá con el id de la pieza. Se busca la fila de stock enlazada a esa pieza y se va al
 * producto. Si la usan varios productos, se elige.
 */
export default async function PiezaDeBodega({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let tenantId: string;
  try {
    tenantId = (await getAuthenticatedTenant()).tenantId;
  } catch {
    redirect("/login");
  }
  const filas = await prisma.stock.findMany({
    where: { tenantId, bodegaModelId: id },
    select: { modeloId: true, modelo: { select: { nombre: true } } },
  });
  const modelos = [...new Map(filas.map((f) => [f.modeloId, f.modelo.nombre])).entries()];
  if (modelos.length === 1) redirect(`/modelos/${modelos[0][0]}`);

  return (
    <div className="space-y-3 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Pieza de Bodega</h1>
      {modelos.length ? (
        <>
          <p className="text-sm text-muted-foreground">Esta pieza la usan varios productos:</p>
          <ul className="list-disc pl-5 text-sm">
            {modelos.map(([mid, nombre]) => (
              <li key={mid}>
                <Link href={`/modelos/${mid}`} className="underline">
                  {nombre}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ningún producto del ERP usa esta pieza todavía. Enlazala desde{" "}
          <Link href="/stock" className="underline">
            Stock
          </Link>
          .
        </p>
      )}
    </div>
  );
}
