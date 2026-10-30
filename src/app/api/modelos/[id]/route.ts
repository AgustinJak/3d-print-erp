export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { asegurarFilasDeStock } from "@/lib/stock-filas";
import { sembrarCombinacionesDeModelo, soltarVariantesBorradas } from "@/lib/combinaciones";
import { actualizarNombres, grupoDeVariante, tipoDeVariante } from "@/lib/catalogo";
import { parsePrice } from "@/lib/utils";
import { esRedondeo } from "@/lib/precios-formula";
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
            // El lápiz no sabe de grupos: la variante nueva queda en el que le toca por nombre
            // ("Con X" → X, insumo; el resto, decoración). docs/sdd/004, spec 003.
            const base = { nombre: data.nombre, afectaStock: false, grupo: null, tipo: null };
            await tx.varianteModelo.create({ data: { modeloId: id, ...data, grupo: grupoDeVariante(base), tipo: tipoDeVariante(base) } });
          }
        }

        // Las que ya no vienen se borran, y se limpia toda referencia a ellas
        // en las variantes implícitas de las publicaciones de ML.
        const idsBorrados = actuales.filter((v) => !conservados.has(v.id)).map((v) => v.id);
        if (idsBorrados.length > 0) {
          await tx.varianteModelo.deleteMany({ where: { id: { in: idsBorrados } } });
          // Las combinaciones y recetas que las usaban (docs/sdd/001). Renombrar una
          // variante cuenta como borrarla y crear otra: su combinación vieja queda
          // desactivada y la nueva se crea abajo.
          await soltarVariantesBorradas(tx, tenantId, id, idsBorrados);
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
    // Y una combinación por cada variante nueva, o la del modelo solo.
    await sembrarCombinacionesDeModelo(prisma, tenantId, id);

    return NextResponse.json(modelo);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/** El código de error de Prisma, si lo es (P2002 = único repetido, P2003 = lo usa otra tabla). */
const codigoPrisma = (e: unknown): string | null =>
  typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string" ? (e as { code: string }).code : null;

/** ¿Alguna pieza del producto está costeada en Bodega? Entonces el costo sale de ahí (spec 007). */
async function costoDeBodega(modeloId: string): Promise<boolean> {
  const [r] = await prisma.$queryRaw<Array<{ si: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM public.stock s JOIN bodega.models b ON b.id = s.bodega_model_id
       WHERE s.modelo_id = ${modeloId} AND b.filament_grams IS NOT NULL AND b.print_time_seconds IS NOT NULL
    ) AS si`;
  return !!r?.si;
}

/**
 * PATCH /api/modelos/[id] — guardar una sección de la página del producto (docs/sdd/004, spec 002).
 *
 * A diferencia del PUT del lápiz, sólo escribe los campos que vienen y nunca toca las
 * variantes: guardar el precio no puede borrar nada de otra sección. El costo sólo se escribe
 * si ninguna pieza del producto está costeada en Bodega (ahí lo pone el ERP solo).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body: Record<string, unknown> = await request.json().catch(() => ({}));
    const actual = await prisma.modelo.findFirst({ where: { id, tenantId }, select: { id: true, activo: true } });
    if (!actual) return NextResponse.json({ error: "Modelo no encontrado" }, { status: 404 });

    const texto = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : null);
    const importe = (k: string) => {
      const n = parsePrice(body[k] as string | number | null | undefined);
      if (n < 0) throw new Error(`${k} no puede ser negativo`);
      return n;
    };
    const opcional = (k: string) => (body[k] === null || body[k] === "" ? null : importe(k));

    const data: Record<string, unknown> = {};
    if ("nombre" in body) {
      if (!texto("nombre")) return NextResponse.json({ error: "el nombre no puede quedar vacío" }, { status: 400 });
      data.nombre = texto("nombre");
    }
    if ("sku" in body) data.sku = texto("sku") ? texto("sku")!.toUpperCase() : null;
    if ("serie" in body) data.serie = texto("serie") || null;
    if ("notas" in body) data.notas = texto("notas") || null;
    if ("pesoGr" in body) data.pesoGr = opcional("pesoGr");
    if ("precioVenta" in body) data.precioVenta = importe("precioVenta");
    if ("precioCreditoPorc" in body) {
      const n = Number(body.precioCreditoPorc); // porcentaje, no lleva miles
      data.precioCreditoPorc = Number.isFinite(n) && n >= 0 ? n : 10;
    }
    if ("precioMayorista" in body) data.precioMayorista = opcional("precioMayorista");
    if ("precioPromo" in body) data.precioPromo = opcional("precioPromo");
    if ("costoFab" in body || "costoInsumos" in body) {
      if (await costoDeBodega(id)) {
        return NextResponse.json({ error: "el costo de este producto sale de Bodega: se cambia costeando la pieza allá" }, { status: 409 });
      }
      if ("costoFab" in body) data.costoFab = importe("costoFab");
      if ("costoInsumos" in body) data.costoInsumos = importe("costoInsumos");
    }
    if ("archivo3mfUrl" in body) data.archivo3mfUrl = texto("archivo3mfUrl") || null;
    if ("imagenesUrls" in body) {
      const urls = Array.isArray(body.imagenesUrls) ? body.imagenesUrls.filter((u): u is string => typeof u === "string" && !!u.trim()).slice(0, 5) : [];
      data.imagenesUrls = urls;
      data.imagenUrl = urls[0] ?? null; // la primera es la principal
    }
    if ("activo" in body) data.activo = Boolean(body.activo);

    // La política de precio del producto (docs/sdd/006, spec 002): vacío = sigue a la general.
    const pct = (k: string, max: number) => {
      if (body[k] === null || body[k] === "") return null;
      const n = Number(String(body[k]).replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${k} tiene que ir de 0 a ${max}`);
      return n;
    };
    if ("margen" in body) data.margen = pct("margen", 80);
    if ("promoMl" in body) data.promoMl = pct("promoMl", 60);
    if ("redondeo" in body) {
      if (body.redondeo !== null && body.redondeo !== "" && !esRedondeo(body.redondeo)) return NextResponse.json({ error: "redondeo inválido" }, { status: 400 });
      data.redondeo = body.redondeo || null;
    }
    if ("precioMlFijo" in body) data.precioMlFijo = opcional("precioMlFijo");

    const categoriaIds = Array.isArray(body.categoriaIds) ? body.categoriaIds.filter((x): x is string => typeof x === "string") : null;

    try {
      await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length) await tx.modelo.update({ where: { id, tenantId }, data });
        if (categoriaIds) {
          await tx.categoriaModelo.deleteMany({ where: { modeloId: id } });
          if (categoriaIds.length) await tx.categoriaModelo.createMany({ data: categoriaIds.map((categoriaId) => ({ modeloId: id, categoriaId })) });
        }
      });
    } catch (e) {
      if (codigoPrisma(e) === "P2002" && data.sku) {
        const otro = await prisma.modelo.findFirst({ where: { tenantId, sku: data.sku as string }, select: { id: true, nombre: true } });
        return NextResponse.json({ error: `ese SKU ya lo tiene "${otro?.nombre ?? "otro producto"}"`, conflicto: otro }, { status: 409 });
      }
      throw e;
    }

    // Reactivar, o renombrar: las filas, las combinaciones y sus nombres tienen que seguir.
    if ("activo" in body || "nombre" in body) {
      await asegurarFilasDeStock(tenantId, id);
      await sembrarCombinacionesDeModelo(prisma, tenantId, id);
      if ("nombre" in body) await actualizarNombres(tenantId, id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    try {
      await prisma.modelo.delete({ where: { id, tenantId } });
    } catch (e) {
      // Con ventas no se borra: se perderían de Finanzas (docs/sdd/004, spec 001, RN-2).
      if (codigoPrisma(e) === "P2003") {
        const ventas = await prisma.itemPedido.count({ where: { modeloId: id } });
        return NextResponse.json(
          { error: `tiene ${ventas} ${ventas === 1 ? "venta" : "ventas"}: no se puede borrar, se puede desactivar`, ventas },
          { status: 409 }
        );
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
