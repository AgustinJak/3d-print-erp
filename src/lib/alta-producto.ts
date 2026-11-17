import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { crearGrupo, ErrorDeCatalogo } from "@/lib/catalogo";
import { asegurarFilasDeStock } from "@/lib/stock-filas";
import { sembrarCombinacionesDeModelo } from "@/lib/combinaciones";
import { engancharPieza } from "@/lib/archivos-de-piezas";
import { aplicarCostosSiCambio } from "@/lib/sincronizar-costos";
import { validarAlta, type EntradaAlta, type ModeloDeAlta, type RecetaDeAlta } from "@/lib/alta-producto-reglas";

/**
 * El alta de un producto en el ERP (docs/sdd/014, spec 002): el producto, una pieza de Bodega y una
 * fila de stock enganchada por cada pieza física, las combinaciones, la funda (elegida o nueva) y
 * el archivo de cada pieza, de una vez.
 *
 * Reutiliza lo que ya arma la página del producto (`crearGrupo`, `asegurarFilasDeStock`). Esas
 * funciones escriben cada una por su lado, así que no hay una transacción que abarque todo: si
 * algo falla a mitad, `deshacer` borra lo que se creó (RN-7: se guarda todo o nada).
 *
 * Cada pieza nace enganchada a su fila en la misma transacción (RN-4): si no, el alta automática
 * de `altas-bodega.ts` la vería suelta y crearía otro producto.
 */

const TENANT_DE_BODEGA = "sendero3d";

interface Creado {
  modelos: string[];
  piezas: string[];
}

async function materialValido(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [m] = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM bodega.materials WHERE id = ${id}`;
  return m?.id ?? null;
}

/** Una pieza de Bodega nueva, enganchada a su fila de stock y, si viene, a su archivo. */
async function crearPieza(
  tenantId: string,
  creado: Creado,
  p: { stockId: string; nombre: string; receta: RecetaDeAlta; modelo: ModeloDeAlta | null; categoria: string | null }
): Promise<string> {
  const id = randomUUID();
  const material = await materialValido(p.receta.materialId);
  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO bodega.models (id, name, category, stock, updated_at, filament_grams, print_time_seconds, insumos, material_id)
      VALUES (${id}, ${p.nombre}, ${p.categoria}, 0, now(), ${p.receta.gramos}, ${p.receta.segundos}, ${p.receta.insumos}, ${material})`,
    prisma.stock.update({ where: { id: p.stockId }, data: { bodegaModelId: id } }),
  ]);
  creado.piezas.push(id);
  if (p.modelo) {
    const r = await engancharPieza(tenantId, id, p.modelo.archivoId, p.modelo.placa);
    if ("error" in r) throw new ErrorDeCatalogo(`${p.nombre}: ${r.error}`);
  }
  return id;
}

/** Borra lo que se llegó a crear. Sólo se usa si el alta falla a mitad. */
async function deshacer(creado: Creado) {
  if (creado.piezas.length) {
    await prisma.piezaArchivo.deleteMany({ where: { bodegaModelId: { in: creado.piezas } } });
    await prisma.$executeRaw`DELETE FROM bodega.models WHERE id = ANY(${creado.piezas})`;
  }
  for (const modeloId of creado.modelos.reverse()) {
    await prisma.reglaInsumo.deleteMany({ where: { modeloId } });
    await prisma.combinacion.deleteMany({ where: { modeloId } });
    await prisma.modelo.deleteMany({ where: { id: modeloId } }); // variantes y stock caen en cascada
  }
}

export interface ResultadoAlta {
  modeloId: string;
  piezas: number;
  insumoNuevoId: string | null;
}

export async function crearProductoCompleto(tenantId: string, entrada: EntradaAlta): Promise<ResultadoAlta> {
  const error = validarAlta(entrada);
  if (error) throw new ErrorDeCatalogo(error);
  // Las piezas son de Bodega, que es de un solo negocio (ver altas-bodega.ts).
  const conPiezas = tenantId === TENANT_DE_BODEGA;
  const e = entrada;
  const nombre = e.nombre.trim().replace(/\s+/g, " ");

  const repetido = await prisma.modelo.findFirst({
    where: { tenantId, consolidadoEnId: null, esInsumo: false, nombre: { equals: nombre, mode: "insensitive" } },
    select: { id: true, activo: true },
  });
  if (repetido) throw new ErrorDeCatalogo(`ya hay un producto "${nombre}"${repetido.activo ? "" : " (desactivado)"}: elegí otro nombre`);

  const creado: Creado = { modelos: [], piezas: [] };
  try {
    // 1. La funda nueva, si la hay: un insumo con su fila y su pieza (como altaComoInsumo).
    let insumoStockId = e.funda?.insumoStockId ?? null;
    let insumoNuevoId: string | null = null;
    if (e.funda?.nuevo) {
      const n = e.funda.nuevo;
      const nombreInsumo = n.nombre.trim().replace(/\s+/g, " ");
      const yaInsumo = await prisma.modelo.findFirst({ where: { tenantId, esInsumo: true, nombre: { equals: nombreInsumo, mode: "insensitive" } }, select: { id: true } });
      if (yaInsumo) throw new ErrorDeCatalogo(`ya hay un insumo "${nombreInsumo}": elegilo de la lista`);
      const categoria = await prisma.categoria.findFirst({ where: { tenantId, nombre: { equals: "Insumos", mode: "insensitive" } }, select: { id: true } });
      const m = await prisma.modelo.create({
        data: { tenantId, nombre: nombreInsumo, activo: false, esInsumo: true, categorias: categoria ? { create: [{ categoriaId: categoria.id }] } : undefined },
        select: { id: true },
      });
      creado.modelos.push(m.id);
      insumoNuevoId = m.id;
      const fila = await prisma.stock.create({
        data: { tenantId, modeloId: m.id, clave: `${m.id}|`, etiqueta: nombreInsumo, variantes: [], cantidad: 0, minimo: 0 },
        select: { id: true },
      });
      insumoStockId = fila.id;
      if (conPiezas) await crearPieza(tenantId, creado, { stockId: fila.id, nombre: nombreInsumo, receta: n.receta, modelo: n.modelo, categoria: "Insumos" });
    }

    // 2. El producto.
    const m = await prisma.modelo.create({ data: { tenantId, nombre, serie: e.serie?.trim() || null, activo: true }, select: { id: true } });
    creado.modelos.push(m.id);

    // 3. Sus piezas: una por opción del grupo de piezas, o una sola.
    if (e.variantes) {
      const opciones = e.variantes.opciones.map((o) => o.nombre.trim().replace(/\s+/g, " "));
      await crearGrupo(tenantId, m.id, { nombre: e.variantes.grupo, tipo: "pieza", opciones });
      if (e.fabrica && conPiezas) {
        const variantes = await prisma.varianteModelo.findMany({ where: { modeloId: m.id }, select: { id: true, nombre: true } });
        for (const o of e.variantes.opciones) {
          const nombreOpcion = o.nombre.trim().replace(/\s+/g, " ");
          const v = variantes.find((x) => x.nombre.toLowerCase() === nombreOpcion.toLowerCase());
          const fila = v ? await prisma.stock.findFirst({ where: { tenantId, modeloId: m.id, variantes: { equals: [v.id] } }, select: { id: true } }) : null;
          if (!fila) throw new ErrorDeCatalogo(`no quedó la fila de stock de "${nombreOpcion}"`);
          await crearPieza(tenantId, creado, {
            stockId: fila.id,
            nombre: `${nombre} · ${nombreOpcion}`,
            receta: { ...e.receta, ...Object.fromEntries(Object.entries(o.receta ?? {}).filter(([, x]) => x != null)) },
            modelo: o.modelo,
            categoria: null,
          });
        }
      }
    } else {
      await asegurarFilasDeStock(tenantId, m.id);
      if (e.fabrica && conPiezas) {
        const fila = await prisma.stock.findFirst({ where: { tenantId, modeloId: m.id, variantes: { isEmpty: true } }, select: { id: true } });
        if (!fila) throw new ErrorDeCatalogo("no quedó la fila de stock del producto");
        await crearPieza(tenantId, creado, { stockId: fila.id, nombre, receta: e.receta, modelo: e.modelo, categoria: null });
      }
    }

    // 4. La funda: "Con X" descuenta el insumo, "Sin X" no.
    if (e.funda) await crearGrupo(tenantId, m.id, { nombre: e.funda.grupo, tipo: "insumo", insumoStockId });
    else await sembrarCombinacionesDeModelo(prisma, tenantId, m.id);

    // 5. El costo sale de las piezas (SDD 004, spec 007): que se calcule ya, no en la próxima vuelta.
    await aplicarCostosSiCambio(tenantId).catch(() => null);

    return { modeloId: m.id, piezas: creado.piezas.length, insumoNuevoId };
  } catch (err) {
    await deshacer(creado).catch((e2) => console.error("[alta-producto] no se pudo deshacer:", e2, creado));
    throw err;
  }
}
