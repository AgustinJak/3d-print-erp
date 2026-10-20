import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import { deducirPorPublicacion } from "@/lib/mercadolibre-sync";
import { claveDe } from "@/lib/combinaciones";
import { claveMl, describirVenta, esAmbigua, resolverLinea } from "@/lib/mapeo-canal";
import { reasignarReservas } from "@/lib/reservas";

/**
 * Siembra del mapeo de Mercado Libre (docs/sdd/001, spec 004, REQ-6).
 *
 * Por cada publicación conocida en `publicaciones_ml` (con modelo, o marcada
 * como de otro negocio) lee sus variaciones con `GET /items/{MLA}` y registra una
 * clave por variación, resuelta con la misma lógica que el sync. **Sólo lee ML:**
 * no escribe nada en la publicación.
 */

interface VariacionMl {
  id: number;
  attribute_combinations?: Array<{ name: string; value_name: string | null }>;
}

interface ItemMlApi {
  id: string;
  title: string;
  status?: string;
  variations?: VariacionMl[];
}

/** Un atributo que vale lo mismo en todas las variaciones no dice cuál se vendió. */
function atributosQueNoDefinen(variaciones: VariacionMl[]): Set<string> {
  const valores = new Map<string, Set<string>>();
  for (const v of variaciones) {
    for (const a of v.attribute_combinations ?? []) {
      if (!valores.has(a.name)) valores.set(a.name, new Set());
      valores.get(a.name)!.add(a.value_name ?? "");
    }
  }
  return new Set([...valores].filter(([, vs]) => vs.size === 1).map(([n]) => n));
}

export interface ResultadoSiembraMl {
  publicaciones: number;
  claves: number;
  mapeadas: number;
  ignoradas: number;
  enCola: number;
  yaExistian: number;
  /** Líneas de pedidos abiertos que esperaban una clave que ahora se resolvió. */
  lineasCompletadas: number;
  /** Publicaciones que ML no devolvió (borradas, de otra cuenta). */
  errores: Array<{ mla: string; error: string }>;
  detalle: Array<{ clave: string; descripcion: string; resultado: string }>;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Con `simular` no escribe nada: dice qué haría. Con `rehacer`, las claves que no
 * se tocaron a mano se vuelven a resolver (sirve al cambiar la publicación en la
 * pestaña de Mercado Libre). Es idempotente y se puede cortar y reanudar.
 */
export async function sembrarMapeosMl(
  tenantId: string,
  opts: { simular?: boolean; rehacer?: boolean; mlas?: string[] } = {}
): Promise<ResultadoSiembraMl> {
  const pubs = await prisma.publicacionMl.findMany({
    where: {
      tenantId,
      OR: [{ modeloId: { not: null } }, { ignorar: true }],
      ...(opts.mlas ? { mla: { in: opts.mlas } } : {}),
    },
    select: { mla: true, titulo: true },
    orderBy: { mla: "asc" },
  });

  const out: ResultadoSiembraMl = {
    publicaciones: pubs.length,
    claves: 0,
    mapeadas: 0,
    ignoradas: 0,
    enCola: 0,
    yaExistian: 0,
    lineasCompletadas: 0,
    errores: [],
    detalle: [],
  };

  for (const [i, p] of pubs.entries()) {
    if (i > 0) await pausa(150); // de a una y sin apuro: la API de ML tiene cupo
    let item: ItemMlApi;
    try {
      item = await mlFetch<ItemMlApi>(tenantId, `/items/${encodeURIComponent(p.mla)}`);
    } catch (e) {
      out.errores.push({ mla: p.mla, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      continue;
    }

    const variaciones = item.variations ?? [];
    const noDefinen = atributosQueNoDefinen(variaciones);
    const claves =
      variaciones.length === 0
        ? [{ clave: claveMl(p.mla, null), variationId: null as number | null, atributos: [] as Array<{ name: string; value_name: string }> }]
        : variaciones.map((v) => ({
            clave: claveMl(p.mla, v.id),
            variationId: v.id,
            atributos: (v.attribute_combinations ?? []).map((a) => ({ name: a.name, value_name: a.value_name ?? "" })),
          }));

    for (const k of claves) {
      out.claves++;
      const titulo = item.title || p.titulo || p.mla;
      const descripcion = describirVenta(titulo, k.atributos.map((a) => ({ grupo: a.name, nombre: a.value_name })));
      const d = await deducirPorPublicacion(tenantId, p.mla, k.atributos, { atributosQueNoDefinen: noDefinen });
      const sugerencia = d.ignorar
        ? ({ ignorar: true } as const)
        : d.modelo
          ? { modeloId: d.modelo.id, variantes: d.variantes, sinDudas: d.sinDudas }
          : null;

      const existente = await prisma.mapeoCanal.findUnique({
        where: { tenantId_canal_clave: { tenantId, canal: "mercadolibre", clave: k.clave } },
        select: { id: true, origen: true, combinacionId: true, ignorar: true },
      });
      const rehace = Boolean(opts.rehacer && existente && existente.origen !== "manual");
      if (existente && !rehace) out.yaExistian++;

      if (opts.simular) {
        let resultado = "cola";
        if (existente && !rehace) resultado = existente.ignorar ? "ignorar" : existente.combinacionId ? "ya mapeada" : "cola";
        else if (sugerencia && "ignorar" in sugerencia && sugerencia.ignorar) resultado = "ignorar";
        else if (sugerencia && !sugerencia.ignorar && sugerencia.sinDudas) {
          const c = await prisma.combinacion.findUnique({
            where: { tenantId_clave: { tenantId, clave: claveDe(sugerencia.modeloId, sugerencia.variantes) } },
            select: { nombre: true, activo: true },
          });
          if (await esAmbigua(prisma, tenantId, sugerencia.modeloId, sugerencia.variantes)) {
            resultado = `cola (${d.modelo?.nombre} sin decir cuál variante)`;
          } else if (c) {
            resultado = c.activo ? `→ ${c.nombre}` : `cola (${c.nombre} está desactivada)`;
          } else {
            const nombres = await prisma.varianteModelo.findMany({
              where: { id: { in: sugerencia.variantes } },
              select: { nombre: true },
            });
            resultado = `→ combinación nueva: ${d.modelo?.nombre} · ${nombres.map((v) => v.nombre).join(" · ")}`;
          }
        }
        if (resultado.startsWith("→") || resultado === "ya mapeada") out.mapeadas++;
        else if (resultado === "ignorar") out.ignoradas++;
        else out.enCola++;
        out.detalle.push({ clave: k.clave, descripcion, resultado });
        continue;
      }

      if (rehace) {
        await prisma.mapeoCanal.update({ where: { id: existente!.id }, data: { combinacionId: null, ignorar: false } });
      }
      const r = await resolverLinea(prisma, tenantId, "mercadolibre", k.clave, {
        sugerencia,
        descripcion,
        muestra: { titulo, variation_id: k.variationId, atributos: k.atributos } as Prisma.InputJsonValue,
        contar: false,
        origen: "siembra",
      });
      if (r.tipo === "combinacion") {
        out.mapeadas++;
        out.lineasCompletadas += r.completadas ?? 0;
      } else if (r.tipo === "ignorar") out.ignoradas++;
      else out.enCola++;
      out.detalle.push({
        clave: k.clave,
        descripcion,
        resultado: r.tipo === "combinacion" ? `→ ${r.combinacion.nombre}` : r.tipo,
      });
    }
  }
  if (out.lineasCompletadas > 0) await reasignarReservas(tenantId);
  return out;
}
