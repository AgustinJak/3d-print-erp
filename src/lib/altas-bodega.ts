import { prisma } from "@/lib/prisma";
import { fabricacionDeReceta, leerParametros, leerRecetas } from "@/lib/costos-bodega";

/**
 * Un modelo nuevo en Bodega aparece solo en el inventario.
 *
 * Hasta ahora, cada pieza que nacía en Bodega había que darla de alta a mano acá
 * y mapearla: crear el modelo, crear su fila de stock y enlazarla con
 * `Stock.bodegaModelId`. Mientras eso no pasaba, lo que se producía no contaba
 * en ningún lado.
 *
 * El alta automática arranca en blanco a propósito. Bodega arrastra años de
 * pruebas —"Better+organized", "requiem_revolver", un "yamato 95" que ni existe
 * en la base local— y volcarlas todas al inventario lo ensuciaría de una. Así
 * que la primera vez que esto corre anota lo que ya había como "no traer", y de
 * ahí en adelante todo lo nuevo entra solo. Lo viejo queda en una lista para
 * revisar con calma.
 *
 * Las categorías no se traducen: Bodega las organiza por tamaño de pieza
 * (Katanas/Grandes, MiniKatana) y el ERP por tipo de producto (Collares,
 * Juguetes). No hay correspondencia, así que el modelo entra sin categoría
 * antes que con una equivocada.
 */

const CLAVE = "bodegaSinTraer";

/**
 * Bodega es de un solo negocio.
 *
 * Su base no tiene columna de tenant: las funciones que la exponen fijan
 * `sendero3d` a mano (ver `bodega_unidades_stock` en bodega-stock.sql). Sin este
 * candado, alguien entrando con la cuenta demo dispararía el alta automática y
 * se llevaría los 118 modelos de Bodega a un inventario que no es el suyo.
 */
const TENANT_DE_BODEGA = "sendero3d";
const esDeBodega = (tenantId: string) => tenantId === TENANT_DE_BODEGA;

export interface CandidatoBodega {
  bodegaModelId: string;
  nombre: string;
  categoria: string | null;
  tieneReceta: boolean;
  costoFab: number;
  costoInsumos: number;
  /** Si ya hay un modelo del ERP con ese nombre, se mapea en vez de duplicar. */
  modeloExistenteId: string | null;
  modeloExistenteNombre: string | null;
}

export interface ResultadoAltas {
  creados: Array<{ nombre: string; modeloId: string; stockId: string; costoFab: number }>;
  mapeados: Array<{ nombre: string; modeloId: string; stockId: string }>;
  omitidos: Array<{ nombre: string; motivo: string }>;
}

async function leerSinTraer(tenantId: string): Promise<Set<string> | null> {
  const filas = await prisma.$queryRaw<Array<{ ids: string[] | null }>>`
    SELECT data->${CLAVE} AS ids FROM public.config_tenant WHERE tenant_id = ${tenantId}
  `.catch(() => [] as Array<{ ids: string[] | null }>);
  const v = filas[0]?.ids;
  // `null` (nunca se inicializó) no es lo mismo que lista vacía: la primera vez
  // hay que anotar lo que ya estaba en vez de traerlo.
  if (v == null) return null;
  return new Set(Array.isArray(v) ? v : []);
}

async function guardarSinTraer(tenantId: string, ids: string[]): Promise<void> {
  const json = JSON.stringify([...new Set(ids)]);
  await prisma.$executeRaw`
    INSERT INTO public.config_tenant (id, tenant_id, data)
    VALUES (gen_random_uuid()::text, ${tenantId}, jsonb_build_object('bodegaSinTraer', ${json}::jsonb))
    ON CONFLICT (tenant_id) DO UPDATE
      SET data = config_tenant.data || jsonb_build_object('bodegaSinTraer', ${json}::jsonb)
  `;
}

/** Los modelos de Bodega que todavía no tienen fila de stock en el ERP. */
export async function candidatosDeBodega(
  tenantId: string
): Promise<{ nuevos: CandidatoBodega[]; sinTraer: CandidatoBodega[]; inicializado: boolean }> {
  if (!esDeBodega(tenantId)) return { nuevos: [], sinTraer: [], inicializado: true };

  const [bodega, recetas, parametros, filas, modelos, ignorados] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string; category: string | null }>>`
      SELECT id, name, category FROM bodega.models ORDER BY name
    `,
    leerRecetas(),
    leerParametros(),
    prisma.stock.findMany({ where: { tenantId }, select: { bodegaModelId: true, modeloId: true } }),
    prisma.modelo.findMany({ where: { tenantId }, select: { id: true, nombre: true } }),
    leerSinTraer(tenantId),
  ]);

  const mapeados = new Set(filas.map((f) => f.bodegaModelId).filter(Boolean) as string[]);
  const conFila = new Set(filas.map((f) => f.modeloId));
  const porNombre = new Map(modelos.map((m) => [m.nombre.trim().toLowerCase(), m]));

  const armar = (b: { id: string; name: string; category: string | null }): CandidatoBodega => {
    const r = recetas.get(b.id);
    const existente = porNombre.get(b.name.trim().toLowerCase());
    return {
      bodegaModelId: b.id,
      nombre: b.name,
      categoria: b.category,
      tieneReceta: !!r,
      costoFab: r ? Math.round(fabricacionDeReceta(parametros, r.gramos, r.segundos)) : 0,
      costoInsumos: r?.insumos ?? 0,
      // Sólo cuenta como "ya existe" si además no tiene fila de stock: si la
      // tiene, es otro producto que casualmente se llama igual.
      modeloExistenteId: existente && !conFila.has(existente.id) ? existente.id : null,
      modeloExistenteNombre: existente && !conFila.has(existente.id) ? existente.nombre : null,
    };
  };

  const pendientes = bodega.filter((b) => !mapeados.has(b.id)).map(armar);
  if (ignorados == null) return { nuevos: [], sinTraer: pendientes, inicializado: false };

  return {
    nuevos: pendientes.filter((p) => !ignorados.has(p.bodegaModelId)),
    sinTraer: pendientes.filter((p) => ignorados.has(p.bodegaModelId)),
    inicializado: true,
  };
}

/** Da de alta en el inventario los modelos de Bodega que se le indiquen. */
export async function crearDesdeBodega(tenantId: string, ids: string[]): Promise<ResultadoAltas> {
  const out: ResultadoAltas = { creados: [], mapeados: [], omitidos: [] };
  if (ids.length === 0 || !esDeBodega(tenantId)) return out;

  const { nuevos, sinTraer } = await candidatosDeBodega(tenantId);
  const porId = new Map([...nuevos, ...sinTraer].map((c) => [c.bodegaModelId, c]));

  for (const id of ids) {
    const c = porId.get(id);
    if (!c) {
      out.omitidos.push({ nombre: id, motivo: "ya está mapeado o no existe en Bodega" });
      continue;
    }

    // El resultado sale de la transacción en vez de anotarse adentro: si el
    // commit falla, no queda nada reportado como hecho.
    const hecho = await prisma.$transaction(async (tx) => {
      // Si ya hay un modelo con ese nombre sin fila de stock, se le cuelga la
      // fila en vez de crear un duplicado con el mismo nombre.
      const modeloId =
        c.modeloExistenteId ??
        (
          await tx.modelo.create({
            data: {
              tenantId,
              nombre: c.nombre,
              activo: true,
              costoFab: c.costoFab,
              costoInsumos: c.costoInsumos,
            },
            select: { id: true },
          })
        ).id;

      const fila = await tx.stock.upsert({
        where: { tenantId_clave: { tenantId, clave: `${modeloId}|` } },
        create: {
          tenantId,
          modeloId,
          clave: `${modeloId}|`,
          etiqueta: c.nombre,
          variantes: [],
          cantidad: 0,
          minimo: 0,
          bodegaModelId: c.bodegaModelId,
        },
        update: { bodegaModelId: c.bodegaModelId },
      });

      return { modeloId, stockId: fila.id, reusado: c.modeloExistenteId != null };
    });

    if (hecho.reusado) {
      out.mapeados.push({ nombre: c.nombre, modeloId: hecho.modeloId, stockId: hecho.stockId });
    } else {
      out.creados.push({
        nombre: c.nombre,
        modeloId: hecho.modeloId,
        stockId: hecho.stockId,
        costoFab: c.costoFab,
      });
    }
  }

  // Lo que se trajo deja de estar en la lista de "no traer".
  const ignorados = (await leerSinTraer(tenantId)) ?? new Set<string>();
  const quedan = [...ignorados].filter((x) => !ids.includes(x));
  await guardarSinTraer(tenantId, quedan);

  return out;
}

/** Marca modelos de Bodega para que el alta automática no los traiga nunca. */
export async function marcarSinTraer(tenantId: string, ids: string[]): Promise<void> {
  const ignorados = (await leerSinTraer(tenantId)) ?? new Set<string>();
  for (const id of ids) ignorados.add(id);
  await guardarSinTraer(tenantId, [...ignorados]);
}

/**
 * ¿Hay algo para dar de alta? Una sola consulta, para poder preguntarlo seguido.
 *
 * `candidatosDeBodega` trae modelos, stock, recetas y parámetros: está bien para
 * pintar una pantalla, pero no para llamarlo cada quince segundos. Esto cuenta
 * los modelos de Bodega que no están mapeados ni descartados, y nada más.
 */
async function hayPendientes(tenantId: string): Promise<{ faltan: number; inicializado: boolean }> {
  const filas = await prisma.$queryRaw<Array<{ faltan: number; inicializado: boolean }>>`
    SELECT
      (SELECT count(*)::int FROM bodega.models b
        WHERE NOT EXISTS (
          SELECT 1 FROM public.stock s
           WHERE s.tenant_id = ${tenantId} AND s.bodega_model_id = b.id
        )
          AND NOT (
            COALESCE(
              (SELECT data->'bodegaSinTraer' FROM public.config_tenant WHERE tenant_id = ${tenantId}),
              '[]'::jsonb
            ) ? b.id
          )
      ) AS faltan,
      EXISTS (
        SELECT 1 FROM public.config_tenant
         WHERE tenant_id = ${tenantId} AND data ? 'bodegaSinTraer'
      ) AS inicializado
  `;
  return filas[0] ?? { faltan: 0, inicializado: false };
}

/**
 * Trae solo lo que nació en Bodega después de que esto se encendió.
 *
 * La primera vez no crea nada: anota lo que ya existía como "no traer", que es
 * lo que evita que años de pruebas entren de golpe al inventario.
 */
export async function altasAutomaticas(tenantId: string): Promise<ResultadoAltas & { inicializo: boolean }> {
  if (!esDeBodega(tenantId)) return { creados: [], mapeados: [], omitidos: [], inicializo: false };

  // Atajo barato: si no hay nada pendiente, no se toca nada más.
  const previo = await hayPendientes(tenantId);
  if (previo.inicializado && previo.faltan === 0) {
    return { creados: [], mapeados: [], omitidos: [], inicializo: false };
  }

  const { nuevos, sinTraer, inicializado } = await candidatosDeBodega(tenantId);

  if (!inicializado) {
    await guardarSinTraer(tenantId, sinTraer.map((c) => c.bodegaModelId));
    return { creados: [], mapeados: [], omitidos: [], inicializo: true };
  }
  if (nuevos.length === 0) return { creados: [], mapeados: [], omitidos: [], inicializo: false };

  const r = await crearDesdeBodega(tenantId, nuevos.map((c) => c.bodegaModelId));
  return { ...r, inicializo: false };
}
