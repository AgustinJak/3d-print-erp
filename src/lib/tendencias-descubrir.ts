import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import { temaDeTexto } from "@/lib/temas";
import { productosConVentas, productosDelTema } from "@/lib/tendencias-vista";

/**
 * "Descubrir" de Tendencias (docs/sdd/016, 2026-11-20): lo que sube en las categorías de ML donde
 * entra lo que se imprime, para sacar productos nuevos. Agustín: "mi gracia era encontrar
 * tendencias que vienen para sacar nuevos productos, no ver en qué tendencias están mis productos".
 *
 * Las categorías a vigilar ("vidrieras") se eligen en la pantalla y viven en
 * `config_tenant.data.tendencias_vidrieras`. Las búsquedas son las mismas fotos diarias de
 * `busquedas_ml` que lee el cron.
 */

const TENANT = "sendero3d";
const CLAVE = "tendencias_vidrieras";

export interface Vidriera {
  id: string;
  nombre: string;
}

/** Las subcategorías de Juguetes y Cotillón donde aparecen temáticas, más Espadas y Llaveros. */
export const VIDRIERAS_POR_DEFECTO: Vidriera[] = [
  { id: "MLA432888", nombre: "Muñecos y Muñecas" },
  { id: "MLA1166", nombre: "Peluches" },
  { id: "MLA432991", nombre: "Juguetes Antiestrés e Ingenio" },
  { id: "MLA455857", nombre: "Disfraces y Cosplay" },
  { id: "MLA412060", nombre: "Llaveros" },
  { id: "MLA352391", nombre: "Espadas" },
  { id: "MLA457877", nombre: "Miniaturas" },
  { id: "MLA432873", nombre: "Hobbies" },
  { id: "MLA403648", nombre: "Decoración para Fiestas" },
  { id: "MLA352344", nombre: "Armas y Lanzadores de Juguete" },
];

/** Raíces cuyas subcategorías se ofrecen para elegir. */
const RAICES_DE_OPCIONES = [
  { id: "MLA1132", nombre: "Juegos y Juguetes" },
  { id: "MLA9304", nombre: "Souvenirs, Cotillón y Fiestas" },
  { id: "MLA1574", nombre: "Hogar, Muebles y Jardín" },
  { id: "MLA1144", nombre: "Consolas y Videojuegos" },
];

export async function leerVidrieras(): Promise<Vidriera[]> {
  const [f] = await prisma.$queryRaw<Array<{ v: Vidriera[] | null }>>`
    SELECT data->${CLAVE} AS v FROM public.config_tenant WHERE tenant_id = ${TENANT}`;
  return Array.isArray(f?.v) && f.v.length ? f.v : VIDRIERAS_POR_DEFECTO;
}

/** Las subcategorías de las raíces, para el diálogo de elegir. Con las elegidas marcadas. */
export async function opcionesDeVidrieras(): Promise<Array<Vidriera & { grupo: string; elegida: boolean }>> {
  const elegidas = new Set((await leerVidrieras()).map((v) => v.id));
  const out: Array<Vidriera & { grupo: string; elegida: boolean }> = [];
  const vistos = new Set<string>();
  for (const r of RAICES_DE_OPCIONES) {
    try {
      const c = await mlFetch<{ children_categories?: Array<{ id: string; name: string }> }>(TENANT, `/categories/${r.id}`);
      for (const h of c.children_categories ?? []) {
        if (vistos.has(h.id)) continue;
        vistos.add(h.id);
        out.push({ id: h.id, nombre: h.name, grupo: r.nombre, elegida: elegidas.has(h.id) });
      }
    } catch (e) {
      console.error("[tendencias-descubrir] opciones", r.id, e instanceof Error ? e.message : e);
    }
  }
  // Las elegidas que no son de esas raíces (Espadas, Llaveros) también se ofrecen.
  for (const v of await leerVidrieras()) {
    if (!vistos.has(v.id)) out.unshift({ ...v, grupo: "Elegidas", elegida: true });
  }
  return out;
}

export async function guardarVidrieras(ids: unknown): Promise<{ ok: true; vidrieras: Vidriera[] } | { error: string }> {
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string" && /^MLA\d+$/.test(x))) return { error: "Las categorías van como lista de ids de ML (MLA…)" };
  const unicos = [...new Set(ids as string[])];
  if (!unicos.length) return { error: "Elegí al menos una categoría" };
  if (unicos.length > 25) return { error: "Como mucho 25 categorías" };
  const vidrieras: Vidriera[] = [];
  for (const id of unicos) {
    try {
      const c = await mlFetch<{ id: string; name: string }>(TENANT, `/categories/${id}`);
      vidrieras.push({ id: c.id, nombre: c.name });
    } catch {
      return { error: `ML no reconoce la categoría ${id}` };
    }
  }
  const v = JSON.stringify(vidrieras);
  await prisma.$executeRaw`
    INSERT INTO public.config_tenant (id, tenant_id, data)
    VALUES (gen_random_uuid()::text, ${TENANT}, jsonb_build_object(${CLAVE}::text, ${v}::jsonb))
    ON CONFLICT (tenant_id) DO UPDATE SET data = config_tenant.data || jsonb_build_object(${CLAVE}::text, ${v}::jsonb)`;
  return { ok: true, vidrieras };
}

export interface BusquedaDescubierta {
  palabra: string;
  normalizada: string;
  posicion: number;
  /** La posición en la foto de hace 7 días o más, si estaba. */
  posicionAntes: number | null;
  /** No estaba en esa foto (sólo cuando hay una foto tan vieja). */
  nueva: boolean;
  /** En cuántos días de los últimos 30 apareció en esta categoría. */
  dias: number;
  /** Si coincide con un tema: el tema y si ya tenés productos de él. */
  tema: { id: string; nombre: string; conProductos: boolean } | null;
}

export interface VidrieraConBusquedas extends Vidriera {
  busquedas: BusquedaDescubierta[];
  nuevas: number;
}

export interface Destacada extends BusquedaDescubierta {
  categorias: string[];
  puntaje: number;
}

export interface Descubrir {
  fotoMl: string | null;
  /** Hay una foto de hace 7 días o más: las comparaciones valen. */
  conComparacion: boolean;
  vidrieras: VidrieraConBusquedas[];
  destacadas: Destacada[];
}

const DIA = 24 * 60 * 60 * 1000;

export async function armarDescubrir(): Promise<Descubrir> {
  const vidrieras = await leerVidrieras();
  const ids = vidrieras.map((v) => v.id);
  const [ultima] = await prisma.$queryRaw<Array<{ dia: Date | null }>>`
    SELECT max(dia) AS dia FROM public.busquedas_ml WHERE tenant_id = ${TENANT} AND categoria_id = ANY(${ids})`;
  if (!ultima?.dia) return { fotoMl: null, conComparacion: false, vidrieras: vidrieras.map((v) => ({ ...v, busquedas: [], nuevas: 0 })), destacadas: [] };
  const dia = ultima.dia;
  const [vieja] = await prisma.$queryRaw<Array<{ dia: Date | null }>>`
    SELECT max(dia) AS dia FROM public.busquedas_ml
     WHERE tenant_id = ${TENANT} AND categoria_id = ANY(${ids}) AND dia <= ${new Date(dia.getTime() - 7 * DIA)}`;

  const [hoy, antes, constancia, descartadas, temas, productos] = await Promise.all([
    prisma.busquedaMl.findMany({ where: { tenantId: TENANT, dia, categoriaId: { in: ids } }, orderBy: { posicion: "asc" } }),
    vieja?.dia ? prisma.busquedaMl.findMany({ where: { tenantId: TENANT, dia: vieja.dia, categoriaId: { in: ids } }, select: { categoriaId: true, normalizada: true, posicion: true } }) : Promise.resolve([]),
    prisma.$queryRaw<Array<{ categoria_id: string; normalizada: string; dias: bigint }>>`
      SELECT categoria_id, normalizada, count(DISTINCT dia) AS dias FROM public.busquedas_ml
       WHERE tenant_id = ${TENANT} AND categoria_id = ANY(${ids}) AND dia >= ${new Date(dia.getTime() - 30 * DIA)}
       GROUP BY categoria_id, normalizada`,
    prisma.busquedaDescartada.findMany({ where: { tenantId: TENANT }, select: { normalizada: true } }),
    prisma.tema.findMany({ where: { tenantId: TENANT, activo: true }, select: { id: true, nombre: true, alias: true } }),
    productosConVentas(),
  ]);

  const posAntes = new Map(antes.map((a) => [`${a.categoriaId}|${a.normalizada}`, a.posicion]));
  const diasDe = new Map(constancia.map((c) => [`${c.categoria_id}|${c.normalizada}`, Number(c.dias)]));
  const fuera = new Set(descartadas.map((d) => d.normalizada));
  const conProductos = new Set(temas.filter((t) => productosDelTema(t.alias, productos).some((p) => p.activo)).map((t) => t.id));

  const porVidriera = new Map<string, BusquedaDescubierta[]>();
  for (const b of hoy) {
    if (fuera.has(b.normalizada)) continue;
    const clave = `${b.categoriaId}|${b.normalizada}`;
    const t = temaDeTexto(b.palabra, temas);
    const antesPos = posAntes.get(clave) ?? null;
    porVidriera.set(b.categoriaId, [
      ...(porVidriera.get(b.categoriaId) ?? []),
      {
        palabra: b.palabra,
        normalizada: b.normalizada,
        posicion: b.posicion,
        posicionAntes: antesPos,
        nueva: !!vieja?.dia && antesPos == null,
        dias: diasDe.get(clave) ?? 1,
        tema: t ? { id: t.id, nombre: t.nombre, conProductos: conProductos.has(t.id) } : null,
      },
    ]);
  }

  const lista: VidrieraConBusquedas[] = vidrieras.map((v) => {
    const busquedas = porVidriera.get(v.id) ?? [];
    return { ...v, busquedas, nuevas: busquedas.filter((b) => b.nueva && !b.tema?.conProductos).length };
  });

  // Lo que más se repite: lo que no tenés, sumando todas las categorías donde aparece.
  const juntas = new Map<string, Destacada>();
  for (const v of lista) {
    for (const b of v.busquedas) {
      if (b.tema?.conProductos) continue;
      const puntos =
        ((51 - b.posicion) / 50) * 2 + (b.nueva ? 1 : 0) + (b.dias >= 3 ? 1 : 0) + (b.posicionAntes != null && b.posicionAntes - b.posicion >= 10 ? 1 : 0);
      const ya = juntas.get(b.normalizada);
      if (ya) {
        ya.puntaje += puntos;
        ya.categorias.push(v.nombre);
        if (b.posicion < ya.posicion) Object.assign(ya, { ...b, categorias: ya.categorias, puntaje: ya.puntaje });
      } else {
        juntas.set(b.normalizada, { ...b, categorias: [v.nombre], puntaje: puntos });
      }
    }
  }
  const destacadas = [...juntas.values()].sort((a, b) => b.puntaje - a.puntaje || a.posicion - b.posicion).slice(0, 12);

  return { fotoMl: dia.toISOString().slice(0, 10), conComparacion: !!vieja?.dia, vidrieras: lista, destacadas };
}
