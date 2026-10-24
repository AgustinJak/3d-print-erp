import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * Precios en la web: el endpoint del Shop (docs/sdd/003, spec 006; del lado del Shop, su
 * docs/sdd/018).
 *
 * El Shop guarda el precio como base + extra por opción + reglas, y la traducción es suya: el ERP
 * le manda el precio final de cada combinación de un producto y el Shop decide cómo guardarlo. Por
 * eso se trabaja por **producto entero**: todas sus combinaciones van juntas, y se escribe todo o
 * nada.
 *
 * Contrato (verificado en `Shop/sendero-shop/src/app/api/inventario/precios/route.ts`):
 * - `POST {SHOP_API_URL}/api/inventario/precios`, firmado con HMAC-SHA256 sobre
 *   `${timestamp}.${cuerpo}` con el secreto del contrato 1 (`SHOP_WEBHOOK_SECRET` acá), headers
 *   `x-inventario-signature` y `x-inventario-timestamp` en segundos, 5 minutos de tolerancia.
 * - `simular: true` no escribe y devuelve, por combinación, lo que se cobra hoy (`actual`). Sin
 *   `simular`, escribe. Precios enteros mayores que 0; hasta 200 productos y 1 MB por pedido.
 * - Por producto: `ok`, `sin_cambio`, `no_representable` (con `cambio_concurrente` si cambió en el
 *   Shop mientras se escribía), `faltan_combinaciones` o `no_existe`, y `ignoradas`: las
 *   combinaciones con una opción inactiva o ajena, que no frenan el producto.
 */

const URL_POR_DEFECTO = "https://sendero3d.com";
const TOPE_PRODUCTOS = 200;

export type EstadoShop = "ok" | "sin_cambio" | "no_representable" | "faltan_combinaciones" | "no_existe";

export interface ResultadoShop {
  producto_id: string;
  estado: EstadoShop;
  motivo: string | null;
  combinaciones: Array<{ opcion_ids: string[]; actual: number; nuevo: number }>;
  cambios: unknown;
  ignoradas: Array<{ opcion_ids: string[]; motivo: string }>;
}

/** Lo que queda guardado en `mapeos_canal.precio_lectura` de una clave del Shop. */
export interface LecturaShop {
  /** Cómo contestó el Shop al simular el producto con los precios de ese momento. */
  estado: EstadoShop;
  motivo: string | null;
  /** El Shop no tiene en cuenta esta combinación (una opción inactiva o que no es del producto). */
  ignorada: string | null;
  /** Alguna combinación del producto se simuló sin precio propuesto: el estado no dice nada del precio. */
  conRelleno: boolean;
}

export function configShop(): { url: string; secreto: string } | null {
  const secreto = process.env.SHOP_WEBHOOK_SECRET;
  if (!secreto) return null;
  return { url: (process.env.SHOP_API_URL || URL_POR_DEFECTO).trim().replace(/\/+$/, ""), secreto };
}

export const firmarParaShop = (secreto: string, timestamp: string, cuerpo: string) =>
  createHmac("sha256", secreto).update(`${timestamp}.${cuerpo}`).digest("hex");

export const productoDeClave = (clave: string) => clave.split("|")[0];
export const opcionesDeClave = (clave: string) => {
  const s = clave.split("|")[1] ?? "";
  return s ? s.split(",") : [];
};
const llaveDeOpciones = (ids: string[]) => [...ids].sort().join(",");

/** Llama al endpoint del Shop, en tandas de 200 productos. */
export async function llamarShop(
  productos: Array<{ producto_id: string; combinaciones: Array<{ opcion_ids: string[]; precio: number }> }>,
  simular: boolean
): Promise<ResultadoShop[]> {
  const cfg = configShop();
  if (!cfg) throw new Error("falta SHOP_WEBHOOK_SECRET en el ERP");
  const out: ResultadoShop[] = [];
  for (let i = 0; i < productos.length; i += TOPE_PRODUCTOS) {
    const cuerpo = JSON.stringify({ simular, productos: productos.slice(i, i + TOPE_PRODUCTOS) });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const r = await fetch(`${cfg.url}/api/inventario/precios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-inventario-timestamp": timestamp,
        "x-inventario-signature": firmarParaShop(cfg.secreto, timestamp, cuerpo),
      },
      body: cuerpo,
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await r.json().catch(() => null)) as { productos?: ResultadoShop[]; error?: string } | null;
    if (!r.ok || !data?.productos) throw new Error(`Shop ${r.status}: ${data?.error ?? "sin respuesta"}`);
    out.push(...data.productos);
  }
  return out;
}

/** Ubica cada combinación de la respuesta en su clave del mapeo. */
export function porClave(r: ResultadoShop): Map<string, { actual: number; nuevo: number }> {
  return new Map(r.combinaciones.map((c) => [`${r.producto_id}|${llaveDeOpciones(c.opcion_ids)}`, { actual: c.actual, nuevo: c.nuevo }]));
}

/**
 * Lee lo que se cobra hoy en la web por cada clave del Shop y lo guarda en el mapeo. Simula cada
 * producto con los precios propuestos; donde una combinación no tiene propuesta se manda 1, que
 * es un precio válido y sólo sirve para que el Shop devuelva el actual: con `simular` no se
 * escribe nada.
 */
export async function leerPreciosShop(
  tenantId: string,
  propuestoDe: (clave: string) => number | null
): Promise<{ leidas: number; productos: number; errores: Array<{ producto: string; error: string }> }> {
  const mapeos = await prisma.mapeoCanal.findMany({ where: { tenantId, canal: "shop", ignorar: false }, select: { id: true, clave: true } });
  const porProducto = new Map<string, typeof mapeos>();
  for (const m of mapeos) porProducto.set(productoDeClave(m.clave), [...(porProducto.get(productoDeClave(m.clave)) ?? []), m]);

  const relleno = new Set<string>();
  const pedido = [...porProducto].map(([producto_id, claves]) => ({
    producto_id,
    combinaciones: claves.map((m) => {
      const p = propuestoDe(m.clave);
      if (p == null) relleno.add(producto_id);
      return { opcion_ids: opcionesDeClave(m.clave), precio: p != null ? Math.round(p) : 1 };
    }),
  }));
  if (!pedido.length) return { leidas: 0, productos: 0, errores: [] };

  const resultados = await llamarShop(pedido, true);
  const filas: Array<{ id: string; precio: number | null; lectura: LecturaShop }> = [];
  const errores: Array<{ producto: string; error: string }> = [];
  for (const r of resultados) {
    const actuales = porClave(r);
    const ignoradas = new Map(r.ignoradas.map((x) => [`${r.producto_id}|${llaveDeOpciones(x.opcion_ids)}`, x.motivo]));
    if (r.estado === "no_existe") errores.push({ producto: r.producto_id, error: r.motivo ?? "no existe" });
    for (const m of porProducto.get(r.producto_id) ?? []) {
      filas.push({
        id: m.id,
        precio: actuales.get(m.clave)?.actual ?? null,
        lectura: { estado: r.estado, motivo: r.motivo, ignorada: ignoradas.get(m.clave) ?? null, conRelleno: relleno.has(r.producto_id) },
      });
    }
  }
  if (filas.length) {
    await prisma.$executeRaw`
      UPDATE mapeos_canal AS m
         SET precio_publicado = x.precio, precio_leido_en = now(), precio_lectura = x.lectura
        FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) AS x(id text, precio double precision, lectura jsonb)
       WHERE m.id = x.id AND m.tenant_id = ${tenantId}`;
  }
  return { leidas: filas.filter((f) => f.precio != null).length, productos: resultados.length, errores };
}

/** Por qué una clave del Shop no se puede aplicar por lo que dijo la lectura; null = se puede. */
export function motivoShop(lectura: LecturaShop | null, leidoEn: Date | null, ahora = Date.now()): string | null {
  if (!configShop()) return "falta SHOP_WEBHOOK_SECRET en el ERP";
  if (!lectura || !leidoEn) return "sin leer: tocá «Leer precios de la web»";
  if (ahora - leidoEn.getTime() > 60 * 60 * 1000) return "lectura de más de una hora: volvé a leer";
  if (lectura.ignorada) return `el Shop no la tiene en cuenta: ${lectura.ignorada}`;
  if (lectura.estado === "no_existe") return "el producto no existe o está inactivo en el Shop";
  if (lectura.estado === "faltan_combinaciones") return `al producto le faltan combinaciones en el mapeo: ${lectura.motivo ?? ""}`.trim();
  if (lectura.estado === "no_representable" && !lectura.conRelleno) return `el Shop no puede guardar estos precios: ${lectura.motivo ?? ""}`.trim();
  return null;
}
