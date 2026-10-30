import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import type { LecturaMl } from "@/lib/precios-ml";
import { sumarCategorias, tarifasGuardadas } from "@/lib/tarifas-ml";

/**
 * La categoría de ML de cada producto (docs/sdd/006, spec 004, TASK-007). Define la comisión con
 * que se calcula el precio de lo que todavía no está publicado, y con la que se va a crear.
 *
 * - "publicacion": la de sus publicaciones ya leídas. No se guarda: el motor la toma de la lectura.
 * - "heredada": la que más usan los productos publicados de su misma categoría del ERP.
 * - "predicha": la que propone el predictor de ML (`domain_discovery`) con el nombre.
 * - "manual": la que eligió Agustín. Ninguna de las otras la pisa.
 */

export type OrigenCategoria = "publicacion" | "heredada" | "predicha" | "manual";

export interface CategoriaMl {
  id: string;
  nombre: string;
  /** La comisión de la Clásica en esa categoría, si ya se leyó. */
  comision: number | null;
}

const nombres = new Map<string, string>();

export async function nombreDeCategoria(tenantId: string, id: string): Promise<string> {
  if (!nombres.has(id)) {
    const r = await mlFetch<{ name?: string; path_from_root?: Array<{ name: string }> }>(tenantId, `/categories/${id}`).catch(() => null);
    const camino = r?.path_from_root?.map((x) => x.name);
    nombres.set(id, camino?.length ? camino.slice(-2).join(" › ") : (r?.name ?? id));
  }
  return nombres.get(id)!;
}

/** La categoría con su nombre y su comisión; lee la comisión de ML si todavía no se tiene. */
export async function describirCategoria(tenantId: string, id: string): Promise<CategoriaMl> {
  let t = await tarifasGuardadas(tenantId);
  if (t && t.categorias[id] == null) t = (await sumarCategorias(tenantId, [id]).catch(() => t)) ?? t;
  return { id, nombre: await nombreDeCategoria(tenantId, id), comision: t?.categorias[id] ?? null };
}

/** Lo que propone el predictor de ML para un texto (el nombre del producto). Sólo GET. */
export async function predecirCategorias(tenantId: string, q: string): Promise<CategoriaMl[]> {
  const r = await mlFetch<Array<{ category_id: string; category_name: string }>>(tenantId, `/sites/MLA/domain_discovery/search?q=${encodeURIComponent(q)}&limit=4`);
  const ids = [...new Set((Array.isArray(r) ? r : []).map((x) => x.category_id))];
  return Promise.all(ids.map((id) => describirCategoria(tenantId, id)));
}

/** La categoría de ML de las publicaciones de cada producto (la primera que tenga lectura). */
async function categoriasPublicadas(tenantId: string): Promise<Map<string, string>> {
  const mapeos = await prisma.mapeoCanal.findMany({
    where: { tenantId, canal: "mercadolibre", ignorar: false, combinacionId: { not: null } },
    select: { precioLectura: true, combinacion: { select: { modeloId: true } } },
  });
  const out = new Map<string, string>();
  for (const m of mapeos) {
    const cat = (m.precioLectura as unknown as LecturaMl | null)?.categoria;
    if (cat && m.combinacion && !out.has(m.combinacion.modeloId)) out.set(m.combinacion.modeloId, cat);
  }
  return out;
}

export interface PropuestaDeCategoria {
  modeloId: string;
  modelo: string;
  actual: { id: string | null; origen: string | null };
  propuesta: { id: string; origen: "heredada" | "predicha"; de: string } | null;
}

/**
 * Para cada producto sin publicaciones y sin categoría elegida a mano: la heredada si hay de dónde,
 * si no la predicha. Con `aplicar`, la guarda en `modelos`.
 */
export async function completarCategorias(tenantId: string, opts: { aplicar?: boolean } = {}): Promise<PropuestaDeCategoria[]> {
  const [publicadas, modelos] = await Promise.all([
    categoriasPublicadas(tenantId),
    prisma.modelo.findMany({
      where: { tenantId, activo: true, consolidadoEnId: null, esInsumo: false },
      select: { id: true, nombre: true, categoriaMl: true, categoriaMlOrigen: true, categorias: { select: { categoriaId: true, categoria: { select: { nombre: true } } } } },
    }),
  ]);

  // Por categoría del ERP, cuántos productos publicados usan cada categoría de ML.
  const porCategoriaErp = new Map<string, Map<string, number>>();
  for (const m of modelos) {
    const ml = publicadas.get(m.id);
    if (!ml) continue;
    for (const c of m.categorias) {
      const cuenta = porCategoriaErp.get(c.categoriaId) ?? new Map<string, number>();
      cuenta.set(ml, (cuenta.get(ml) ?? 0) + 1);
      porCategoriaErp.set(c.categoriaId, cuenta);
    }
  }

  const out: PropuestaDeCategoria[] = [];
  for (const m of modelos) {
    if (publicadas.has(m.id) || m.categoriaMlOrigen === "manual") continue;
    const votos = new Map<string, number>();
    for (const c of m.categorias) for (const [ml, n] of porCategoriaErp.get(c.categoriaId) ?? []) votos.set(ml, (votos.get(ml) ?? 0) + n);
    // Hereda sólo si los hermanos están de acuerdo: "Deco/Hogar" junta jaboneras con soportes de
    // auriculares, y heredar de ahí mandaba una jabonera a "Soportes para Auriculares".
    const total = [...votos.values()].reduce((x, y) => x + y, 0);
    const primera = [...votos].sort((a, b) => b[1] - a[1])[0];
    const heredada = primera && primera[1] >= 2 && primera[1] / total >= 0.6 ? primera : undefined;
    let propuesta: PropuestaDeCategoria["propuesta"] = null;
    if (heredada) propuesta = { id: heredada[0], origen: "heredada", de: m.categorias.map((c) => c.categoria.nombre).join(", ") };
    else {
      const p = (await predecirCategorias(tenantId, m.nombre).catch(() => []))[0];
      if (p) propuesta = { id: p.id, origen: "predicha", de: `"${m.nombre}"` };
    }
    out.push({ modeloId: m.id, modelo: m.nombre, actual: { id: m.categoriaMl, origen: m.categoriaMlOrigen }, propuesta });
    if (opts.aplicar && propuesta && (propuesta.id !== m.categoriaMl || propuesta.origen !== m.categoriaMlOrigen)) {
      await prisma.modelo.update({ where: { id: m.id }, data: { categoriaMl: propuesta.id, categoriaMlOrigen: propuesta.origen } });
    }
  }
  if (opts.aplicar) {
    const ids = [...new Set(out.map((x) => x.propuesta?.id).filter((x): x is string => !!x))];
    if (ids.length) await sumarCategorias(tenantId, ids).catch(() => undefined);
  }
  return out;
}

/** La categoría con que se calcula un producto, y de dónde sale (para la página del producto). */
export async function categoriaDeProducto(tenantId: string, modeloId: string): Promise<(CategoriaMl & { origen: OrigenCategoria }) | null> {
  const publicada = (await categoriasPublicadas(tenantId)).get(modeloId);
  if (publicada) return { ...(await describirCategoria(tenantId, publicada)), origen: "publicacion" };
  const m = await prisma.modelo.findFirst({ where: { id: modeloId, tenantId }, select: { categoriaMl: true, categoriaMlOrigen: true } });
  if (!m?.categoriaMl) return null;
  return { ...(await describirCategoria(tenantId, m.categoriaMl)), origen: (m.categoriaMlOrigen as OrigenCategoria) ?? "manual" };
}
