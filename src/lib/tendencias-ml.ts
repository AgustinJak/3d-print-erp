import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import { CATEGORIA_SITIO, hoyEnArgentina, normalizar } from "@/lib/temas";

/**
 * Las búsquedas que suben en Mercado Libre (docs/sdd/016, spec 002).
 *
 * `GET /trends/MLA/{categoría}` da las 50 búsquedas que más crecieron en la semana contra dos
 * semanas antes. Se leen (decisión de Agustín, 2026-11-20): las categorías de los productos
 * activos, la raíz de cada una (Juguetes, Hogar…) y la del sitio entero. La foto se guarda una
 * vez por día en `busquedas_ml`; leer dos veces el mismo día no duplica.
 */

const TENANT = "sendero3d";
const CLAVE_CACHE = "tendencias_categorias_ml";

interface CategoriaMl {
  id: string;
  name: string;
  path_from_root?: Array<{ id: string; name: string }>;
}

interface DatoDeCategoria {
  nombre: string;
  raiz: string | null;
  raizNombre: string | null;
}

/** Nombre y raíz de cada categoría, guardados en `config_tenant` para no pedirlos cada día. */
async function datosDeCategorias(ids: string[]): Promise<Record<string, DatoDeCategoria>> {
  const [f] = await prisma.$queryRaw<Array<{ v: Record<string, DatoDeCategoria> | null }>>`
    SELECT data->${CLAVE_CACHE} AS v FROM public.config_tenant WHERE tenant_id = ${TENANT}`;
  const cache: Record<string, DatoDeCategoria> = { ...(f?.v ?? {}) };
  let cambio = false;
  for (const id of ids) {
    if (cache[id]) continue;
    try {
      const c = await mlFetch<CategoriaMl>(TENANT, `/categories/${id}`);
      const raiz = c.path_from_root?.[0];
      cache[id] = { nombre: c.name, raiz: raiz && raiz.id !== id ? raiz.id : null, raizNombre: raiz && raiz.id !== id ? raiz.name : null };
      if (raiz && !cache[raiz.id]) cache[raiz.id] = { nombre: raiz.name, raiz: null, raizNombre: null };
      cambio = true;
    } catch (e) {
      console.error("[tendencias-ml] categoría", id, e instanceof Error ? e.message : e);
    }
  }
  if (cambio) {
    await prisma.$executeRaw`
      INSERT INTO public.config_tenant (id, tenant_id, data)
      VALUES (gen_random_uuid()::text, ${TENANT}, jsonb_build_object(${CLAVE_CACHE}::text, ${JSON.stringify(cache)}::jsonb))
      ON CONFLICT (tenant_id) DO UPDATE SET data = config_tenant.data || jsonb_build_object(${CLAVE_CACHE}::text, ${JSON.stringify(cache)}::jsonb)`;
  }
  return cache;
}

/** Qué categorías leer: las de los productos activos, sus raíces y el sitio. Con su nombre. */
export async function categoriasALeer(): Promise<Array<{ id: string; nombre: string }>> {
  const filas = await prisma.modelo.findMany({
    where: { tenantId: TENANT, activo: true, esInsumo: false, categoriaMl: { not: null } },
    select: { categoriaMl: true },
    distinct: ["categoriaMl"],
  });
  const hojas = filas.map((f) => f.categoriaMl!).filter(Boolean);
  const datos = await datosDeCategorias(hojas);
  const out = new Map<string, string>([[CATEGORIA_SITIO, "todo ML"]]);
  for (const h of hojas) {
    const d = datos[h];
    out.set(h, d?.nombre ?? h);
    if (d?.raiz) out.set(d.raiz, d.raizNombre ?? d.raiz);
  }
  return [...out].map(([id, nombre]) => ({ id, nombre }));
}

export interface ResultadoDeBusquedas {
  categorias: number;
  conDatos: number;
  palabras: number;
  errores: Array<{ categoria: string; error: string }>;
}

/** Lee `/trends` de cada categoría y guarda la foto de hoy. Con `guardar: false` sólo cuenta. */
export async function leerBusquedasMl(opciones: { guardar?: boolean } = {}): Promise<ResultadoDeBusquedas & { filas: Array<{ categoriaId: string; categoria: string; palabra: string; posicion: number }> }> {
  const guardar = opciones.guardar ?? true;
  const categorias = await categoriasALeer();
  const dia = hoyEnArgentina();
  const errores: ResultadoDeBusquedas["errores"] = [];
  const filas: Array<{ categoriaId: string; categoria: string; palabra: string; posicion: number; url: string | null }> = [];
  let conDatos = 0;

  for (const c of categorias) {
    try {
      const r = await mlFetch<Array<{ keyword: string; url?: string }>>(TENANT, c.id === CATEGORIA_SITIO ? "/trends/MLA" : `/trends/MLA/${c.id}`);
      const lista = Array.isArray(r) ? r : [];
      if (lista.length) conDatos++;
      lista.forEach((k, i) => {
        if (k?.keyword) filas.push({ categoriaId: c.id, categoria: c.nombre, palabra: k.keyword, posicion: i + 1, url: k.url ?? null });
      });
    } catch (e) {
      errores.push({ categoria: c.id, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
  }

  if (guardar && filas.length) {
    await prisma.busquedaMl.createMany({
      data: filas.map((f) => ({
        categoriaId: f.categoriaId,
        categoria: f.categoria,
        palabra: f.palabra,
        normalizada: normalizar(f.palabra),
        posicion: f.posicion,
        url: f.url,
        dia: new Date(`${dia}T00:00:00Z`),
      })),
      skipDuplicates: true,
    });
  }
  return { categorias: categorias.length, conDatos, palabras: filas.length, errores, filas };
}
