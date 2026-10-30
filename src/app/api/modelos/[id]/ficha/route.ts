export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { gruposDe, tipoDeVariante, type TipoGrupo } from "@/lib/catalogo";
import { fabricacionDePieza, leerParametros, leerRecetas } from "@/lib/costos-bodega";
import { cargarContexto, componentesDeItem, type Componente } from "@/lib/reservas";
import { leerGastosDeVenta, preciosDeCombinaciones } from "@/lib/precios-combinacion";
import { categoriaDeProducto } from "@/lib/categorias-ml";
import { PREFIJO_FALTA, textoDeFalta } from "@/lib/precios-reglas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export interface PiezaDeFila {
  id: string;
  /** null = la fila apunta a una pieza que Bodega todavía no subió (creada sin archivo, app cerrada). */
  nombre: string | null;
  costo: number | null;
}

export interface FilaDeFicha {
  id: string;
  etiqueta: string | null;
  cantidad: number;
  pieza: PiezaDeFila | null;
}

export interface OpcionDeFicha {
  id: string;
  nombre: string;
  precioAdicional: number;
  costoFabAdicional: number;
  costoInsumosAdicional: number;
  notas: string | null;
  /** La fila de stock propia (grupos de piezas). */
  fila: FilaDeFicha | null;
  /** El insumo que descuenta ("Con X" de un grupo de insumo). */
  insumo: { stockId: string; etiqueta: string; cantidad: number } | null;
}

export interface Ficha {
  producto: {
    id: string;
    nombre: string;
    sku: string | null;
    serie: string | null;
    pesoGr: number | null;
    notas: string | null;
    precioVenta: number;
    precioCreditoPorc: number;
    precioMayorista: number | null;
    precioPromo: number | null;
    costoFab: number;
    costoInsumos: number;
    archivo3mfUrl: string | null;
    imagenesUrls: string[];
    activo: boolean;
    esInsumo: boolean;
    creadoEn: string;
    categorias: Array<{ id: string; nombre: string; color: string | null }>;
    consolidadoEn: { id: string; nombre: string } | null;
  };
  costo: {
    /** Alguna pieza del producto está costeada en Bodega: el costo lo pone el ERP solo. */
    deBodega: boolean;
    /** Piezas enganchadas que Bodega todavía no costeó. */
    faltan: string[];
  };
  /**
   * La política de precio del producto (docs/sdd/006, spec 002): null = sigue a la general. La
   * general viene para mostrar qué usa el producto cuando no tiene la suya.
   */
  politica: {
    margen: number | null;
    promoMl: number | null;
    redondeo: string | null;
    precioMlFijo: number | null;
    general: { margen: number; promo: number; redondeo: string; origen: "erp" | "bodega" | "medidos" };
    /** La categoría de ML con que se calcula (spec 004): la de sus publicaciones, heredada, predicha o a mano. */
    categoria: { id: string; nombre: string; comision: number | null; origen: "publicacion" | "heredada" | "predicha" | "manual" } | null;
  };
  grupos: Array<{ nombre: string; tipo: TipoGrupo; opciones: OpcionDeFicha[] }>;
  /** La fila del producto cuando no tiene grupo de piezas. */
  fila: FilaDeFicha | null;
  /** Filas que ya no corresponden a nada que se venda (quedaron con stock o pieza). */
  filasSobrantes: FilaDeFicha[];
  combinaciones: Array<{
    id: string;
    nombre: string;
    sku: string | null;
    activo: boolean;
    variantes: string[];
    consume: Componente[];
    pendiente: boolean;
    /** Los tres precios de Bodega (docs/sdd/003, spec 004, REQ-6); se aplican desde Precios. */
    precios: { ml: number; mlPublicado: number; web: number; personalizado: number } | null;
    /** Por qué no tiene precio. */
    faltaCostear: string | null;
  }>;
  /** Para un insumo: los productos que lo usan. */
  usadoPor: Array<{ id: string; nombre: string }>;
  canales: {
    publicaciones: Array<{ mla: string; titulo: string | null }>;
    claves: Array<{ id: string; canal: string; descripcion: string | null; combinacion: string | null; activa: boolean; origen: string }>;
  };
}

/**
 * GET /api/modelos/[id]/ficha — todo lo que pinta la página del producto, en una vuelta
 * (docs/sdd/004). Antes la página pedía el modelo y después una receta por combinación, cada
 * una cargando el contexto entero del reparto.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;

    const m = await prisma.modelo.findFirst({
      where: { id, tenantId },
      include: {
        categorias: { include: { categoria: { select: { id: true, nombre: true, color: true } } } },
        variantes: { where: { activo: true }, orderBy: { nombre: "asc" } },
        consolidadoEn: { select: { id: true, nombre: true } },
      },
    });
    if (!m) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    const general = await leerGastosDeVenta(tenantId);

    const [filas, combinaciones, reglas, publicaciones, ctx, parametros, recetas, precios] = await Promise.all([
      prisma.stock.findMany({ where: { tenantId, modeloId: id }, select: { id: true, etiqueta: true, cantidad: true, variantes: true, bodegaModelId: true }, orderBy: { etiqueta: "asc" } }),
      prisma.combinacion.findMany({ where: { tenantId, modeloId: id }, select: { id: true, nombre: true, sku: true, activo: true, variantes: true }, orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
      prisma.reglaInsumo.findMany({ where: { tenantId, modeloId: id }, select: { requiere: true, stockId: true, cantidad: true, stock: { select: { etiqueta: true } } } }),
      prisma.publicacionMl.findMany({ where: { tenantId, modeloId: id, ignorar: false }, select: { mla: true, titulo: true }, orderBy: { mla: "asc" } }),
      cargarContexto(prisma, tenantId),
      leerParametros(),
      leerRecetas(),
      preciosDeCombinaciones(tenantId, { modeloIds: [id] }),
    ]);
    const precioDe = new Map(precios.map((p) => [p.combinacionId, p]));

    // Nombres de las piezas (también las que no tienen receta, que leerRecetas no trae).
    const idsPieza = filas.map((f) => f.bodegaModelId).filter((x): x is string => !!x);
    const nombresPieza = new Map(
      idsPieza.length
        ? (await prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM bodega.models WHERE id = ANY(${idsPieza})`).map((p) => [p.id, p.name])
        : []
    );
    const fichaDeFila = (f: (typeof filas)[number]): FilaDeFicha => {
      const r = f.bodegaModelId ? recetas.get(f.bodegaModelId) : undefined;
      return {
        id: f.id,
        etiqueta: f.etiqueta,
        cantidad: f.cantidad,
        pieza: f.bodegaModelId
          ? { id: f.bodegaModelId, nombre: nombresPieza.get(f.bodegaModelId) ?? null, costo: r ? Math.round(fabricacionDePieza(parametros, r) + (r.insumos ?? 0)) : null }
          : null,
      };
    };

    const filaDeVariante = new Map<string, (typeof filas)[number]>();
    const usadas = new Set<string>();
    for (const f of filas) if (f.variantes.length === 1) filaDeVariante.set(f.variantes[0], f);

    const grupos = gruposDe(m.variantes).map((g) => ({
      nombre: g.nombre,
      tipo: g.tipo,
      opciones: g.opciones.map((v): OpcionDeFicha => {
        const fila = g.tipo === "pieza" ? filaDeVariante.get(v.id) : undefined;
        if (fila) usadas.add(fila.id);
        // El insumo de "Con X": la regla cuya condición es exactamente esa variante.
        const regla = g.tipo === "insumo" ? reglas.find((r) => r.requiere.length === 1 && r.requiere[0] === v.id) : undefined;
        return {
          id: v.id,
          nombre: v.nombre,
          precioAdicional: v.precioAdicional,
          costoFabAdicional: v.costoFabAdicional,
          costoInsumosAdicional: v.costoInsumosAdicional,
          notas: v.notas,
          fila: fila ? fichaDeFila(fila) : null,
          insumo: regla ? { stockId: regla.stockId, etiqueta: regla.stock.etiqueta ?? "", cantidad: regla.cantidad } : null,
        };
      }),
    }));

    const tienePiezas = grupos.some((g) => g.tipo === "pieza");
    const filaPropia = tienePiezas ? undefined : filas.find((f) => f.variantes.length === 0);
    if (filaPropia) usadas.add(filaPropia.id);
    const filasSobrantes = filas.filter((f) => !usadas.has(f.id)).map(fichaDeFila);

    const conPieza = filas.filter((f) => f.bodegaModelId);
    const deBodega = conPieza.some((f) => recetas.has(f.bodegaModelId!));
    const faltan = conPieza
      .filter((f) => !recetas.has(f.bodegaModelId!))
      .map((f) => nombresPieza.get(f.bodegaModelId!) ?? f.etiqueta ?? f.id);

    const tipoDe = new Map(m.variantes.map((v) => [v.id, tipoDeVariante(v)]));
    const fichaCombinaciones = combinaciones.map((c) => {
      const consume = componentesDeItem(
        { modeloId: id, cantidad: 1, variantesInfo: null, combinacion: { modeloId: id, variantes: c.variantes } },
        ctx,
        "combinacion"
      );
      const precio = precioDe.get(c.id);
      const conInsumo = c.variantes.some((v) => tipoDe.get(v) === "insumo" && /^\s*con\s+/i.test(m.variantes.find((x) => x.id === v)?.nombre ?? ""));
      return {
        id: c.id,
        nombre: c.nombre,
        sku: c.sku,
        activo: c.activo,
        variantes: c.variantes,
        consume,
        pendiente: c.activo && conInsumo && !consume.some((x) => x.tipo === "insumo" && x.stockId),
        precios: precio?.precios ? { ml: precio.precios.ml, mlPublicado: precio.precios.mlPublicado, web: precio.precios.web, personalizado: precio.precios.personalizado } : null,
        faltaCostear: precio && !precio.precios ? textoDeFalta(precio.falta).replace(`${PREFIJO_FALTA} — `, "") : null,
      };
    });

    // Para un insumo: quién lo consume.
    const usadoPor = m.esInsumo
      ? await prisma.modelo.findMany({
          where: { tenantId, reglasInsumo: { some: { stockId: { in: filas.map((f) => f.id) } } } },
          select: { id: true, nombre: true },
          orderBy: { nombre: "asc" },
        })
      : [];

    const claves = await prisma.mapeoCanal.findMany({
      where: { tenantId, ignorar: false, combinacionId: { in: combinaciones.map((c) => c.id) } },
      select: { id: true, canal: true, descripcion: true, origen: true, combinacion: { select: { nombre: true, activo: true } } },
      orderBy: [{ canal: "asc" }, { descripcion: "asc" }],
    });

    const ficha: Ficha = {
      producto: {
        id: m.id,
        nombre: m.nombre,
        sku: m.sku,
        serie: m.serie,
        pesoGr: m.pesoGr,
        notas: m.notas,
        precioVenta: m.precioVenta,
        precioCreditoPorc: m.precioCreditoPorc,
        precioMayorista: m.precioMayorista,
        precioPromo: m.precioPromo,
        costoFab: m.costoFab,
        costoInsumos: m.costoInsumos,
        archivo3mfUrl: m.archivo3mfUrl,
        // La principal primero, sin repetir: hasta acá vivía también en `imagenUrl`.
        imagenesUrls: [...new Set([...(m.imagenUrl ? [m.imagenUrl] : []), ...m.imagenesUrls])].slice(0, 5),
        activo: m.activo,
        esInsumo: m.esInsumo,
        creadoEn: m.creadoEn.toISOString(),
        categorias: m.categorias.map((c) => c.categoria),
        consolidadoEn: m.consolidadoEn,
      },
      costo: { deBodega, faltan },
      politica: {
        margen: m.margen,
        promoMl: m.promoMl,
        redondeo: m.redondeo,
        precioMlFijo: m.precioMlFijo,
        general: { margen: general.gastos.margenMinorista, promo: general.gastos.mlPromoPct, redondeo: general.redondeo, origen: general.origen },
        categoria: await categoriaDeProducto(tenantId, m.id).catch(() => null),
      },
      grupos,
      fila: filaPropia ? fichaDeFila(filaPropia) : null,
      filasSobrantes,
      combinaciones: fichaCombinaciones,
      usadoPor,
      canales: {
        publicaciones,
        claves: claves.map((k) => ({
          id: k.id,
          canal: k.canal,
          descripcion: k.descripcion,
          combinacion: k.combinacion?.nombre ?? null,
          activa: !!k.combinacion?.activo,
          origen: k.origen,
        })),
      },
    };
    return NextResponse.json(ficha);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

