import { prisma } from "@/lib/prisma";
import { sembrarCombinacionesDeModelo } from "@/lib/combinaciones";
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
  /**
   * Qué se haría con este modelo. Decidirlo acá y no al escribir es lo que
   * permite mostrarlo en pantalla antes de tocar nada.
   */
  accion: "crear" | "enlazar" | "conflicto";
  /** Si ya hay un modelo del ERP con ese nombre, se enlaza en vez de duplicar. */
  modeloExistenteId: string | null;
  modeloExistenteNombre: string | null;
  /** La fila de stock suelta a la que se engancharía, si la hay. */
  filaLibreId: string | null;
  /** Sólo con `conflicto`: por qué no se resuelve solo. */
  motivo: string | null;
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
    // El orden importa cuando dos piezas de Bodega se llaman igual: como una de
    // las dos suele ser un fantasma —Bodega sube pero nunca borra—, va primero
    // la sincronizada más recientemente, que es la que está viva en el taller.
    prisma.$queryRaw<Array<{ id: string; name: string; category: string | null }>>`
      SELECT id, name, category FROM bodega.models ORDER BY name, updated_at DESC
    `,
    leerRecetas(),
    leerParametros(),
    prisma.stock.findMany({ where: { tenantId }, select: { id: true, bodegaModelId: true, modeloId: true } }),
    prisma.modelo.findMany({ where: { tenantId }, select: { id: true, nombre: true } }),
    leerSinTraer(tenantId),
  ]);

  const mapeados = new Set(filas.map((f) => f.bodegaModelId).filter(Boolean) as string[]);
  const porNombre = new Map(modelos.map((m) => [m.nombre.trim().toLowerCase(), m]));
  const filasPorModelo = new Map<string, typeof filas>();
  for (const f of filas) {
    const a = filasPorModelo.get(f.modeloId) ?? [];
    a.push(f);
    filasPorModelo.set(f.modeloId, a);
  }

  /**
   * Qué hacer con un modelo de Bodega que no está mapeado.
   *
   * La regla dura: **si ya hay un modelo del ERP con ese nombre, no se crea
   * otro**. Antes se creaba uno nuevo cuando el existente ya tenía fila de
   * stock, bajo la idea de que sería otro producto que casualmente se llama
   * igual. En la práctica pasó lo contrario: Bodega sube pero nunca borra, así
   * que un modelo borrado allá queda arriba para siempre y vuelve a aparecer
   * como si fuera nuevo. Eso duplicó el Collar K4os tres veces, y el bueno
   * —con SKU, 50 unidades y 147 ventas— quedó perdido entre dos vacíos.
   *
   * Un duplicado silencioso es el peor resultado posible: parte el stock en
   * dos filas y nadie se entera hasta que falta mercadería. Mejor no hacer
   * nada y decirlo.
   */
  const armar = (b: { id: string; name: string; category: string | null }): CandidatoBodega => {
    const r = recetas.get(b.id);
    const base = {
      bodegaModelId: b.id,
      nombre: b.name,
      categoria: b.category,
      tieneReceta: !!r,
      costoFab: r ? Math.round(fabricacionDeReceta(parametros, r.gramos, r.segundos)) : 0,
      costoInsumos: r?.insumos ?? 0,
    };

    const existente = porNombre.get(b.name.trim().toLowerCase());
    if (!existente) {
      return { ...base, accion: "crear", modeloExistenteId: null, modeloExistenteNombre: null,
               filaLibreId: null, motivo: null };
    }

    const suyas = filasPorModelo.get(existente.id) ?? [];
    const libre = suyas.find((f) => !f.bodegaModelId);

    // Sin filas, o con una suelta: se engancha ahí. El caso de la fila suelta
    // es justo el del Collar, que había perdido su mapeo.
    if (suyas.length === 0 || libre) {
      return { ...base, accion: "enlazar", modeloExistenteId: existente.id,
               modeloExistenteNombre: existente.nombre, filaLibreId: libre?.id ?? null, motivo: null };
    }

    return {
      ...base,
      accion: "conflicto",
      modeloExistenteId: existente.id,
      modeloExistenteNombre: existente.nombre,
      filaLibreId: null,
      motivo: `ya existe "${existente.nombre}" y todas sus filas de stock están enlazadas a otra pieza de Bodega`,
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

  // Un nombre, un modelo del ERP: eso es lo que hay que sostener, y el plan se
  // calculó una sola vez al principio. Si vienen dos piezas de Bodega llamadas
  // igual, la segunda trabaja sobre una foto vieja y hace daño de tres formas
  // distintas: le pisa el enlace a la fila que la primera acaba de tomar, le
  // pisa la fila que la primera acaba de crear, o —si ninguna existía en el
  // ERP— crea el duplicado que justamente estamos tratando de evitar.
  //
  // Se la queda la primera, que viene ordenada por sincronización más reciente
  // y por lo tanto es la que está viva en el taller. El resto se reporta.
  const nombresTomados = new Set<string>();

  for (const id of ids) {
    const c = porId.get(id);
    if (!c) {
      out.omitidos.push({ nombre: id, motivo: "ya está mapeado o no existe en Bodega" });
      continue;
    }
    // Un conflicto tampoco se fuerza a mano. Acá el daño sería peor que un
    // duplicado: el `upsert` de abajo encontraría la fila del homónimo por su
    // clave y le pisaría el `bodegaModelId`, robándole el mapeo a la otra pieza.
    if (c.accion === "conflicto") {
      out.omitidos.push({ nombre: c.nombre, motivo: c.motivo ?? "conflicto de nombres" });
      continue;
    }
    const nombre = c.nombre.trim().toLowerCase();
    if (nombresTomados.has(nombre)) {
      out.omitidos.push({
        nombre: c.nombre,
        motivo: "otra pieza de Bodega con el mismo nombre se quedó con ese modelo del inventario",
      });
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

      // Si hay una fila suelta de ese mismo modelo, se le engancha a ESA. Hacer
      // upsert por clave crearía una fila nueva al lado cuando la existente
      // tiene variantes, y el stock quedaría partido.
      if (c.filaLibreId) {
        const f = await tx.stock.update({
          where: { id: c.filaLibreId },
          data: { bodegaModelId: c.bodegaModelId },
        });
        return { modeloId, stockId: f.id, reusado: true };
      }

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

    nombresTomados.add(nombre);
    // Que se pueda elegir en un pedido desde el primer día (docs/sdd/001).
    await sembrarCombinacionesDeModelo(prisma, tenantId, hecho.modeloId);

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

  // Los conflictos no se resuelven solos: los decide una persona. Se los marca
  // como "no traer" para que dejen de contar como pendientes —si no, el atajo
  // barato daría pendiente para siempre y el cálculo completo correría en cada
  // consulta— y aparecen en la lista de revisión de Integraciones.
  const conflictos = nuevos.filter((c) => c.accion === "conflicto");
  if (conflictos.length > 0) {
    await marcarSinTraer(tenantId, conflictos.map((c) => c.bodegaModelId));
  }

  const automaticos = nuevos.filter((c) => c.accion !== "conflicto");
  if (automaticos.length === 0) {
    return {
      creados: [], mapeados: [],
      omitidos: conflictos.map((c) => ({ nombre: c.nombre, motivo: c.motivo ?? "conflicto" })),
      inicializo: false,
    };
  }

  const r = await crearDesdeBodega(tenantId, automaticos.map((c) => c.bodegaModelId));
  return {
    ...r,
    omitidos: [...r.omitidos, ...conflictos.map((c) => ({ nombre: c.nombre, motivo: c.motivo ?? "conflicto" }))],
    inicializo: false,
  };
}
