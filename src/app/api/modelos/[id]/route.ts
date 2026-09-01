export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { asegurarFilasDeStock } from "@/lib/stock-filas";
import { parsePrice } from "@/lib/utils";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const modelo = await prisma.modelo.findUnique({
      where: { id, tenantId },
      include: {
        categorias: { include: { categoria: true } },
        variantes: true,
      },
    });
    if (!modelo) {
      return NextResponse.json({ error: "Modelo no encontrado" }, { status: 404 });
    }
    return NextResponse.json(modelo);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();

    const categoriaIds: string[] | undefined = body.categoriaIds;

    const modelo = await prisma.$transaction(async (tx) => {
      // If categoriaIds provided, delete old join records and recreate
      if (categoriaIds !== undefined) {
        await tx.categoriaModelo.deleteMany({ where: { modeloId: id } });
        if (categoriaIds.length > 0) {
          await tx.categoriaModelo.createMany({
            data: categoriaIds.map((catId: string) => ({
              modeloId: id,
              categoriaId: catId,
            })),
          });
        }
      }

      // Sincronizar variantes PRESERVANDO los ids: se emparejan por nombre.
      //
      // Antes se borraban todas y se recreaban, así que el id cambiaba en CADA
      // guardado del modelo. Eso dejaba colgadas las `variantesImplicitas` de
      // las publicaciones de ML (que guardan ids) y el `varianteId` del
      // snapshot de los pedidos históricos.
      if (body.variantes !== undefined) {
        type VarianteInput = {
          nombre: string;
          precioAdicional?: number | string;
          costoFabAdicional?: number | string;
          costoInsumosAdicional?: number | string;
          notas?: string;
        };
        const entrantes: VarianteInput[] = body.variantes ?? [];
        const actuales = await tx.varianteModelo.findMany({ where: { modeloId: id } });
        const clave = (s: string) => s.trim().toLowerCase();
        const porNombre = new Map(actuales.map((v) => [clave(v.nombre), v]));
        const conservados = new Set<string>();

        for (const v of entrantes) {
          if (!v?.nombre?.trim()) continue;
          const data = {
            nombre: v.nombre,
            precioAdicional: parsePrice(v.precioAdicional),
            costoFabAdicional: parsePrice(v.costoFabAdicional),
            costoInsumosAdicional: parsePrice(v.costoInsumosAdicional),
            notas: v.notas || null,
          };
          const existente = porNombre.get(clave(v.nombre));
          if (existente) {
            conservados.add(existente.id);
            await tx.varianteModelo.update({ where: { id: existente.id }, data });
          } else {
            await tx.varianteModelo.create({ data: { modeloId: id, ...data } });
          }
        }

        // Las que ya no vienen se borran, y se limpia toda referencia a ellas
        // en las variantes implícitas de las publicaciones de ML.
        const idsBorrados = actuales.filter((v) => !conservados.has(v.id)).map((v) => v.id);
        if (idsBorrados.length > 0) {
          await tx.varianteModelo.deleteMany({ where: { id: { in: idsBorrados } } });
          const pubs = await tx.publicacionMl.findMany({
            where: { tenantId, modeloId: id, variantesImplicitas: { hasSome: idsBorrados } },
            select: { id: true, variantesImplicitas: true },
          });
          for (const p of pubs) {
            await tx.publicacionMl.update({
              where: { id: p.id },
              data: {
                variantesImplicitas: p.variantesImplicitas.filter((x) => !idsBorrados.includes(x)),
              },
            });
          }
        }
      }

      return tx.modelo.update({
        where: { id, tenantId },
        data: {
          nombre: body.nombre,
          sku: body.sku !== undefined ? (body.sku?.trim() ? body.sku.trim() : null) : undefined,
          serie: body.serie || null,
          pesoGr: body.pesoGr ? parsePrice(body.pesoGr) : null,
          costoFab: body.costoFab != null ? parsePrice(body.costoFab) : undefined,
          costoInsumos: body.costoInsumos != null ? parsePrice(body.costoInsumos) : undefined,
          precioVenta: body.precioVenta != null ? parsePrice(body.precioVenta) : undefined,
          precioCreditoPorc: body.precioCreditoPorc != null ? parseFloat(body.precioCreditoPorc) : undefined,
          precioMayorista: body.precioMayorista !== undefined ? (body.precioMayorista ? parsePrice(body.precioMayorista) : null) : undefined,
          precioPromo: body.precioPromo !== undefined ? (body.precioPromo ? parsePrice(body.precioPromo) : null) : undefined,
          notas: body.notas || null,
          archivo3mfUrl: body.archivo3mfUrl || null,
          imagenUrl: body.imagenUrl || null,
          imagenesUrls: body.imagenesUrls !== undefined ? body.imagenesUrls : undefined,
          activo: body.activo !== undefined ? body.activo : undefined,
        },
        include: {
          categorias: { include: { categoria: true } },
          variantes: true,
        },
      });
    });

    // Si se reactivó, o le aparecieron variantes que definen piezas distintas,
    // tiene que tener su fila en /stock. No pisa lo que ya existe.
    await asegurarFilasDeStock(tenantId, id);

    return NextResponse.json(modelo);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    await prisma.modelo.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
