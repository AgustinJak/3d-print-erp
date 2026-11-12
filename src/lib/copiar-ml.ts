import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, mlFetch, olvidarCuentaDePublicacion } from "@/lib/mercadolibre";
import { atributosParaCopiar, problemasDelTitulo, type AtributoMl, type ValoresDeCategoria } from "@/lib/copiar-ml-reglas";

/**
 * Copiar publicaciones de Sendero 3D a otra cuenta de ML, Sendero Shop (docs/sdd/010, TASK-007).
 *
 * Nunca automático: se revisa contra ML (\`/items/validate\`, no crea nada) y sólo al confirmar se crea,
 * pausada, y queda enlazada a la misma variante del ERP, con la cuenta de destino. Va igual que la
 * original: categoría, atributos, tipo, precio, stock, garantía, disponibilidad, envío, fotos y
 * descripción. El título (en ML, el nombre de familia) lo escribe Agustín y no puede quedar igual
 * (RN-4).
 *
 * Lo aprendido el 2026-11-12 con \`validate\` en la cuenta nueva:
 * - Usa User Products: pide \`family_name\` y rechaza \`title\`.
 * - Con eso contesta sólo avisos ("User has not mode me1", "Mandatory free shipping added"), los
 *   mismos que con el Dumpling, que no frenan la creación.
 * - Los atributos van en la forma que acepta la otra cuenta, no como los devuelve la original: ver
 *   `atributosParaCopiar`.
 */

interface ItemFuente {
  id: string;
  title?: string;
  family_name?: string | null;
  status: string;
  category_id: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  buying_mode: string;
  condition: string;
  listing_type_id: string;
  catalog_listing?: boolean;
  variations?: unknown[];
  pictures?: Array<{ id: string; secure_url?: string; url?: string }>;
  attributes?: AtributoMl[];
  sale_terms?: Array<{ id: string; value_id?: string | null; value_name?: string | null }>;
  shipping?: { local_pick_up?: boolean; free_shipping?: boolean };
}

export interface FuenteDeCopia {
  mla: string;
  combinacion: string | null;
  titulo: string;
  precio: number;
  tipo: "Clásica" | "Premium";
  estado: string;
  fotos: number;
  /** De catálogo: ML puede no dejar copiarla como una publicación común. */
  catalogo: boolean;
  /** Ya tiene copia en la cuenta de destino: el MLA de la copia. */
  copia: string | null;
  /** Lo que impide copiarla, sin depender del título. */
  problema: string | null;
}

export interface PedidoDeCopia {
  mla: string;
  titulo: string;
}

export interface ResultadoDeCopia {
  mla: string;
  titulo: string;
  estado: "revisada" | "creada" | "rechazada" | "error";
  errores: string[];
  avisos: string[];
  /** Al crear: la publicación nueva. */
  nueva: string | null;
  link: string | null;
}

/** La cuenta de destino: otra cuenta del negocio, nunca la principal. */
export async function cuentaDeDestino(tenantId: string, id?: string | null) {
  return prisma.cuentaMercadolibre.findFirst({
    where: { tenantId, principal: false, ...(id ? { id } : {}) },
    orderBy: { creadoEn: "asc" },
    select: { id: true, nombre: true, nickname: true },
  });
}

/** Las publicaciones que ya tienen copia en esa cuenta: original → copia. */
async function copiasHechas(tenantId: string, destino: string): Promise<Map<string, string>> {
  const filas = await prisma.mapeoCanal.findMany({ where: { tenantId, canal: "mercadolibre", cuentaMlId: destino }, select: { clave: true, muestra: true } });
  const out = new Map<string, string>();
  for (const f of filas) {
    const de = (f.muestra as { copiaDe?: string } | null)?.copiaDe;
    if (de) out.set(de, f.clave.split("|")[0]);
  }
  return out;
}

const mlaDe = (clave: string) => clave.split("|")[0];

/** Las publicaciones de la principal enlazadas a variantes del ERP, por MLA. */
async function mapeosDeLaPrincipal(tenantId: string, mlas: string[]) {
  const filas = await prisma.mapeoCanal.findMany({
    where: { tenantId, canal: "mercadolibre", ignorar: false, cuentaMlId: null, combinacionId: { not: null }, OR: mlas.map((m) => ({ clave: { startsWith: `${m}|` } })) },
    select: { clave: true, combinacionId: true, unidades: true, combinacion: { select: { nombre: true } } },
  });
  return new Map(filas.map((f) => [mlaDe(f.clave), f]));
}

async function leerFuente(tenantId: string, mla: string) {
  const item = await mlFetch<ItemFuente>(tenantId, `/items/${mla}?include_attributes=all`, { cuenta: null });
  const desc = await mlFetch<{ plain_text?: string }>(tenantId, `/items/${mla}/description`, { cuenta: null }).catch(() => null);
  return { item, descripcion: desc?.plain_text?.trim() || null };
}

const tituloDe = (it: ItemFuente) => (it.family_name || it.title || "").trim();

/** Qué se va a copiar de cada publicación, sin tocar nada. */
export async function fuentesDeCopia(tenantId: string, mlas: string[], destino: string): Promise<FuenteDeCopia[]> {
  const [mapeos, hechas] = await Promise.all([mapeosDeLaPrincipal(tenantId, mlas), copiasHechas(tenantId, destino)]);
  const out: FuenteDeCopia[] = [];
  for (let i = 0; i < mlas.length; i += 5) {
    const tanda = await Promise.all(
      mlas.slice(i, i + 5).map(async (mla): Promise<FuenteDeCopia> => {
        const m = mapeos.get(mla);
        const base = { mla, combinacion: m?.combinacion?.nombre ?? null, copia: hechas.get(mla) ?? null };
        if (!m) return { ...base, titulo: mla, precio: 0, tipo: "Clásica", estado: "?", fotos: 0, catalogo: false, problema: "No es una publicación de Sendero 3D enlazada a una variante." };
        try {
          const { item } = await leerFuente(tenantId, mla);
          const problema = item.variations?.length ? "Tiene variaciones: todavía no se copian." : item.status === "closed" || item.status === "inactive" ? "Está cerrada en ML." : null;
          return { ...base, titulo: tituloDe(item), precio: item.price, tipo: item.listing_type_id === "gold_pro" ? "Premium" : "Clásica", estado: item.status, fotos: item.pictures?.length ?? 0, catalogo: !!item.catalog_listing, problema };
        } catch (e) {
          return { ...base, titulo: mla, precio: 0, tipo: "Clásica", estado: "?", fotos: 0, catalogo: false, problema: `No se pudo leer: ${e instanceof Error ? e.message.slice(0, 120) : e}` };
        }
      })
    );
    out.push(...tanda);
  }
  return out;
}

/**
 * Los valores vigentes de los atributos de lista de una categoría. Si ML no contesta, vacío: los
 * atributos van como en la original.
 */
async function valoresDeCategoria(tenantId: string, categoria: string, cache: Map<string, Promise<ValoresDeCategoria>>): Promise<ValoresDeCategoria> {
  if (!cache.has(categoria)) {
    cache.set(
      categoria,
      mlFetch<Array<{ id: string; values?: Array<{ id: string; name: string }> }>>(tenantId, `/categories/${categoria}/attributes`, { cuenta: null })
        .then((attrs) => new Map(attrs.filter((a) => a.values?.length).map((a) => [a.id, a.values!])))
        .catch(() => new Map())
    );
  }
  return cache.get(categoria)!;
}

/** El cuerpo para crear la copia: todo como la original, con el título nuevo. */
function cuerpoDeCopia(it: ItemFuente, titulo: string, valores: ValoresDeCategoria): Record<string, unknown> {
  return {
    family_name: titulo.trim(),
    category_id: it.category_id,
    price: it.price,
    currency_id: it.currency_id,
    available_quantity: Math.max(1, it.available_quantity),
    buying_mode: it.buying_mode,
    condition: it.condition,
    listing_type_id: it.listing_type_id,
    // Las mismas fotos, en su versión completa: ML las baja para la cuenta nueva.
    pictures: (it.pictures ?? []).map((p) => ({ source: (p.secure_url ?? p.url ?? "").replace(/^http:/, "https:").replace(/-O\.\w+$/, "-F.jpg") })).filter((p) => p.source),
    attributes: atributosParaCopiar(it.attributes ?? [], valores),
    // Las cuotas no se pueden pedir por la API (INSTALLMENTS_CAMPAIGN es de sólo lectura).
    sale_terms: (it.sale_terms ?? [])
      .filter((s) => s.id !== "INSTALLMENTS_CAMPAIGN" && (s.value_id || s.value_name))
      .map((s) => ({ id: s.id, ...(s.value_id ? { value_id: s.value_id } : { value_name: s.value_name }) })),
    shipping: { mode: "me2", local_pick_up: !!it.shipping?.local_pick_up, ...(it.shipping?.free_shipping ? { free_shipping: true } : {}) },
  };
}

async function ml(tenantId: string, cuenta: string, metodo: string, path: string, cuerpo?: unknown) {
  const tok = await getValidAccessToken(tenantId, cuenta);
  const r = await fetch(`https://api.mercadolibre.com${path}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  try {
    return { status: r.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : null };
  } catch {
    return { status: r.status, json: { message: t.slice(0, 500) } as Record<string, unknown> };
  }
}

/**
 * Revisa (sin crear) o crea las copias en la cuenta de destino. Cada una se vuelve a leer de ML en
 * el momento: lo que se crea es lo que la publicación original tiene ahora.
 */
export async function copiarPublicaciones(tenantId: string, destino: string, pedidos: PedidoDeCopia[], crear: boolean, usuario: string | null): Promise<ResultadoDeCopia[]> {
  const [mapeos, hechas] = await Promise.all([mapeosDeLaPrincipal(tenantId, pedidos.map((p) => p.mla)), copiasHechas(tenantId, destino)]);
  const out: ResultadoDeCopia[] = [];
  const categorias = new Map<string, Promise<ValoresDeCategoria>>();
  for (const p of pedidos) {
    const r: ResultadoDeCopia = { mla: p.mla, titulo: p.titulo.trim(), estado: "revisada", errores: [], avisos: [], nueva: null, link: null };
    out.push(r);
    const mapeo = mapeos.get(p.mla);
    if (!mapeo) {
      r.errores.push("No es una publicación de Sendero 3D enlazada a una variante.");
    } else if (hechas.has(p.mla)) {
      r.errores.push(`Ya está copiada: ${hechas.get(p.mla)}.`);
    }
    let fuente: Awaited<ReturnType<typeof leerFuente>> | null = null;
    if (!r.errores.length) {
      fuente = await leerFuente(tenantId, p.mla).catch((e) => {
        r.errores.push(`No se pudo leer la original: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        return null;
      });
    }
    if (fuente) {
      if (fuente.item.variations?.length) r.errores.push("Tiene variaciones: todavía no se copian.");
      r.errores.push(...problemasDelTitulo(tituloDe(fuente.item), p.titulo));
    }
    if (r.errores.length || !fuente || !mapeo) {
      r.estado = "rechazada";
      continue;
    }
    const cuerpo = cuerpoDeCopia(fuente.item, p.titulo, await valoresDeCategoria(tenantId, fuente.item.category_id, categorias));
    const v = await ml(tenantId, destino, "POST", "/items/validate", cuerpo);
    const causas = (v.json?.cause as Array<{ type: string; code: string; message: string }> | undefined) ?? [];
    for (const c of causas) (c.type === "error" ? r.errores : r.avisos).push(`${c.message} (${c.code})`);
    if (v.status >= 400 && !causas.length) r.errores.push(String(v.json?.message ?? `ML contestó ${v.status}`));
    if (r.errores.length) {
      r.estado = "rechazada";
      continue;
    }
    if (!crear) continue;

    const c = await ml(tenantId, destino, "POST", "/items", cuerpo);
    const nueva = typeof c.json?.id === "string" ? c.json.id : null;
    if (!nueva) {
      r.estado = "error";
      r.errores.push(String(c.json?.message ?? `ML contestó ${c.status}`));
      await prisma.cambioPrecio
        .create({ data: { tenantId, canal: "mercadolibre", clave: `copia|${p.mla}`, combinacionId: mapeo.combinacionId, antes: null, despues: fuente.item.price, estado: "error", respuesta: (c.json ?? Prisma.JsonNull) as Prisma.InputJsonValue, usuario } })
        .catch(() => {});
      continue;
    }
    r.estado = "creada";
    r.nueva = nueva;
    r.link = typeof c.json?.permalink === "string" ? c.json.permalink : null;
    // Desde acá la publicación ya existe en ML: un error no corta la vuelta, se avisa. Reintentar
    // la duplicaría (ya figura como copiada).
    try {
      // ML la crea activa: se pausa enseguida, como en Crear en ML.
      const pausa = await ml(tenantId, destino, "PUT", `/items/${nueva}`, { status: "paused" });
      if (pausa.json?.status !== "paused") r.avisos.push("No se pudo pausar: pausala a mano en ML.");
      if (fuente.descripcion) {
        const d = await ml(tenantId, destino, "POST", `/items/${nueva}/description`, { plain_text: fuente.descripcion });
        if (d.status >= 400) r.avisos.push(`La descripción no se copió (${d.status}): pegala a mano en ML.`);
      }
      await prisma.mapeoCanal.upsert({
        where: { tenantId_canal_clave: { tenantId, canal: "mercadolibre", clave: `${nueva}|` } },
        create: {
          tenantId,
          canal: "mercadolibre",
          clave: `${nueva}|`,
          combinacionId: mapeo.combinacionId,
          unidades: mapeo.unidades,
          origen: "manual",
          cuentaMlId: destino,
          descripcion: `Copia de ${p.mla} (Sendero 3D)`,
          muestra: { titulo: p.titulo.trim(), copiaDe: p.mla },
        },
        update: { combinacionId: mapeo.combinacionId, cuentaMlId: destino },
      });
      olvidarCuentaDePublicacion(tenantId, nueva);
      await prisma.cambioPrecio.create({
        data: { tenantId, canal: "mercadolibre", clave: `${nueva}|`, combinacionId: mapeo.combinacionId, antes: null, despues: fuente.item.price, estado: "creada", respuesta: { copiaDe: p.mla, creada: c.json, pausa: pausa.json } as unknown as Prisma.InputJsonValue, usuario },
      });
    } catch (e) {
      console.error(`[copiar-ml] ${nueva} se creó en ML pero no se pudo terminar de registrar:`, e);
      r.avisos.push("Se creó en ML, pero el ERP no la pudo registrar del todo: avisá antes de volver a copiarla.");
    }
  }
  return out;
}
