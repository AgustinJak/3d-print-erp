import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import { pasosPara, type Entrega, type EstadoFlex, type ResultadoFlex } from "@/lib/entrega-ml";

export { DIAS_MAX } from "@/lib/entrega-ml";
export type { Entrega, EstadoFlex, ResultadoFlex } from "@/lib/entrega-ml";

/**
 * Entrega de las publicaciones de ML desde el ERP (docs/sdd/006, spec 007): Flex y tiempo de
 * disponibilidad, que van juntos. ML no deja tener las dos cosas: si una publicación con Flex
 * recibe tiempo de disponibilidad, ML se lo borra por su cuenta (warning
 * `delete.item.sale_terms.manufacturing_time`), y con tiempo de disponibilidad no se prende Flex.
 *
 * Por eso hay dos modos, que son cómo trabaja Agustín (2026-11-02):
 * - **Inmediata** (hay stock): sin tiempo de disponibilidad y con Flex.
 * - **A pedido** (no hay stock): sin Flex y con N días de disponibilidad, para que las ventas
 *   entren igual pero para después. El stock de ML nunca se toca: no se deja en 0.
 *
 * Flex: `POST` / `DELETE /flex/sites/MLA/items/{id}/v2` (204), probado con el Carrete el
 * 2026-10-30; la publicación cambia al instante su etiqueta (`self_service_in` / `_out`) y el GET
 * de Flex tarda unos 20 segundos, así que se verifica con la publicación. Disponibilidad: `PUT
 * /items/{id}` con el sale_term `MANUFACTURING_TIME` ("15 días", hasta 60), o con `value_id` y
 * `value_name` en null para sacarlo.
 *
 * Nunca automático: a pedido, con vista previa, y queda en `cambios_flex`.
 */

type Termino = { id: string; value_id?: string | null; value_name: string | null; value_struct?: { number?: number } | null };

function diasDe(terms: Termino[] | undefined): number | null {
  const t = terms?.find((s) => s.id === "MANUFACTURING_TIME");
  if (!t?.value_name) return null;
  const n = t.value_struct?.number ?? parseInt(t.value_name, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function leerItem(tenantId: string, mla: string) {
  return mlFetch<{ title?: string; shipping?: { tags?: string[] }; sale_terms?: Termino[] }>(tenantId, `/items/${mla}?attributes=title,shipping,sale_terms`).catch(() => null);
}

async function leer(tenantId: string, mla: string, stockErp: number | null = null): Promise<EstadoFlex> {
  const it = await leerItem(tenantId, mla);
  const tags = it?.shipping?.tags ?? [];
  return {
    mla,
    titulo: it?.title ?? null,
    flex: it ? tags.includes("self_service_in") : null,
    disponible: tags.includes("self_service_in") || tags.includes("self_service_available"),
    dias: diasDe(it?.sale_terms),
    stockErp,
  };
}

/**
 * Stock del ERP por publicación: la combinación enlazada, quedándose con las variantes que mueven
 * stock (la fila de `stock` se identifica así). Si la publicación tiene varias combinaciones, suma.
 */
async function stockPorMla(tenantId: string, mlas: string[]): Promise<Map<string, number | null>> {
  const ms = await prisma.mapeoCanal.findMany({
    where: { tenantId, canal: "mercadolibre", OR: mlas.map((m) => ({ clave: { startsWith: `${m}|` } })), combinacionId: { not: null } },
    select: { clave: true, combinacion: { select: { modeloId: true, variantes: true } } },
  });
  const varIds = [...new Set(ms.flatMap((m) => m.combinacion?.variantes ?? []))];
  const mueven = new Set(
    (await prisma.varianteModelo.findMany({ where: { id: { in: varIds }, afectaStock: true }, select: { id: true } })).map((v) => v.id)
  );
  const claveDe = (c: { modeloId: string; variantes: string[] }) => `${c.modeloId}|${c.variantes.filter((v) => mueven.has(v)).sort().join(",")}`;
  const claves = [...new Set(ms.flatMap((m) => (m.combinacion ? [claveDe(m.combinacion)] : [])))];
  const filas = new Map(
    (await prisma.stock.findMany({ where: { tenantId, clave: { in: claves } }, select: { clave: true, cantidad: true } })).map((s) => [s.clave, s.cantidad])
  );
  const out = new Map<string, number | null>();
  for (const m of ms) {
    const mla = m.clave.split("|")[0];
    const c = m.combinacion ? filas.get(claveDe(m.combinacion)) : undefined;
    if (c == null) {
      if (!out.has(mla)) out.set(mla, null);
    } else out.set(mla, (out.get(mla) ?? 0) + c);
  }
  return out;
}

/** Cómo está cada publicación ahora, sin tocar nada. */
export async function estadoFlex(tenantId: string, mlas: string[]): Promise<EstadoFlex[]> {
  const stock = await stockPorMla(tenantId, mlas);
  return Promise.all(mlas.map((m) => leer(tenantId, m, stock.get(m) ?? null)));
}

/** Guarda el estado nuevo en la lectura de precios, para que la fila muestre la etiqueta sin releer. */
async function anotarEnLectura(tenantId: string, mla: string, e: EstadoFlex) {
  const ms = await prisma.mapeoCanal.findMany({ where: { tenantId, canal: "mercadolibre", clave: { startsWith: `${mla}|` } }, select: { id: true, precioLectura: true } });
  for (const m of ms) {
    if (!m.precioLectura || typeof m.precioLectura !== "object") continue;
    await prisma.mapeoCanal.update({
      where: { id: m.id },
      data: { precioLectura: { ...(m.precioLectura as Record<string, unknown>), flex: !!e.flex, disponibilidad: e.dias } as Prisma.InputJsonValue },
    });
  }
}

/**
 * Pone o saca el tiempo de disponibilidad. Se manda la lista entera de sale_terms con sólo ese
 * cambiado, así no importa si ML reemplaza la lista o la combina por id: garantía, factura y cuotas
 * quedan como estaban.
 */
async function ponerDias(tenantId: string, mla: string, dias: number | null) {
  const it = await leerItem(tenantId, mla);
  if (!it) throw new Error("no se pudo leer la publicación");
  const otros = (it.sale_terms ?? [])
    .filter((t) => t.id !== "MANUFACTURING_TIME")
    .map((t) => ({ id: t.id, value_id: t.value_id ?? null, value_name: t.value_name }));
  const disp = dias == null ? { id: "MANUFACTURING_TIME", value_id: null, value_name: null } : { id: "MANUFACTURING_TIME", value_name: `${dias} días` };
  return mlFetch(tenantId, `/items/${mla}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sale_terms: [...otros, disp] }) });
}

/**
 * Lleva cada publicación al modo pedido, una por una y en el orden que ML acepta: para "inmediata"
 * primero se saca la disponibilidad y después se prende Flex; para "a pedido", primero se apaga
 * Flex (si no, ML borra los días) y después se ponen los días. Cada paso se verifica releyendo.
 */
export async function cambiarEntrega(tenantId: string, mlas: string[], entrega: Entrega, usuario: string | null): Promise<ResultadoFlex[]> {
  const stock = await stockPorMla(tenantId, mlas);
  const out: ResultadoFlex[] = [];
  for (const mla of mlas) {
    const antes = await leer(tenantId, mla, stock.get(mla) ?? null);
    let despues = antes;
    let estado: ResultadoFlex["estado"] = "aplicado";
    let motivo: string | null = null;
    const pasos: Array<{ paso: string; respuesta?: unknown; error?: string }> = [];
    const releer = async () => (despues = await leer(tenantId, mla, antes.stockErp));
    try {
      if (antes.flex == null) throw new Error("no se pudo leer la publicación");
      if (!pasosPara(antes, entrega).length) {
        estado = "sin_efecto";
        motivo = entrega.modo === "inmediata" ? "ya tenía entrega inmediata y Flex" : `ya estaba a pedido, ${entrega.dias} días`;
      } else if (entrega.modo === "inmediata") {
        if (despues.dias != null) {
          pasos.push({ paso: "sacar disponibilidad", respuesta: (await ponerDias(tenantId, mla, null)) ?? null });
          await releer();
          if (despues.dias != null) throw new Error("ML contestó bien pero la disponibilidad sigue");
        }
        if (!despues.flex) {
          if (!despues.disponible) {
            estado = "sin_efecto";
            motivo = pasos.length ? "quedó sin disponibilidad, pero ML no ofrece Flex para esta publicación" : "ML no ofrece Flex para esta publicación";
          } else {
            pasos.push({ paso: "prender Flex", respuesta: (await mlFetch(tenantId, `/flex/sites/MLA/items/${mla}/v2`, { method: "POST" })) ?? null });
            await releer();
            if (!despues.flex) throw new Error("ML contestó bien pero Flex no se prendió");
          }
        }
      } else {
        if (despues.flex) {
          pasos.push({ paso: "apagar Flex", respuesta: (await mlFetch(tenantId, `/flex/sites/MLA/items/${mla}/v2`, { method: "DELETE" })) ?? null });
          await releer();
          if (despues.flex) throw new Error("ML contestó bien pero Flex no se apagó");
        }
        if (despues.dias !== entrega.dias) {
          pasos.push({ paso: `poner ${entrega.dias} días`, respuesta: (await ponerDias(tenantId, mla, entrega.dias)) ?? null });
          await releer();
          if (despues.dias !== entrega.dias) throw new Error("ML contestó bien pero los días no quedaron");
        }
      }
    } catch (e) {
      estado = "error";
      motivo = e instanceof Error ? e.message : String(e);
      pasos.push({ paso: "error", error: motivo });
      await releer();
    }
    if (despues.flex != null && (despues.flex !== antes.flex || despues.dias !== antes.dias)) await anotarEnLectura(tenantId, mla, despues);
    await prisma.cambioFlex.create({
      data: {
        tenantId,
        mla,
        antes: antes.flex,
        despues: despues.flex ?? entrega.modo === "inmediata",
        estado,
        respuesta: { entrega, diasAntes: antes.dias, diasDespues: despues.dias, pasos } as Prisma.InputJsonValue,
        usuario,
      },
    });
    out.push({ ...despues, estado, motivo });
  }
  return out;
}
