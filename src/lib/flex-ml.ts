import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";

/**
 * Flex desde el ERP (docs/sdd/006, spec 007). Probado con el Carrete el 2026-10-30:
 * `DELETE /flex/sites/MLA/items/{id}/v2` lo apaga y `POST` al mismo path lo prende (204). La
 * publicación cambia al instante su etiqueta de envío (`self_service_in` / `self_service_out`); el
 * GET de Flex tarda unos 20 segundos en enterarse, así que se verifica con la publicación.
 *
 * Nunca automático: se prende o apaga a pedido, con vista previa, y queda en `cambios_flex`.
 */

export interface EstadoFlex {
  mla: string;
  titulo: string | null;
  /** null = no se pudo leer. */
  flex: boolean | null;
  /** ML no ofrece Flex para esta publicación (no tiene `self_service_available` ni `_in`). */
  disponible: boolean;
}

export interface ResultadoFlex extends EstadoFlex {
  estado: "aplicado" | "sin_efecto" | "error";
  motivo: string | null;
}

async function leer(tenantId: string, mla: string): Promise<EstadoFlex> {
  const it = await mlFetch<{ title?: string; shipping?: { tags?: string[] } }>(tenantId, `/items/${mla}?attributes=title,shipping`).catch(() => null);
  const tags = it?.shipping?.tags ?? [];
  const flex = it ? tags.includes("self_service_in") : null;
  return { mla, titulo: it?.title ?? null, flex, disponible: tags.includes("self_service_in") || tags.includes("self_service_available") };
}

/** Cómo está cada publicación ahora, sin tocar nada. */
export function estadoFlex(tenantId: string, mlas: string[]): Promise<EstadoFlex[]> {
  return Promise.all(mlas.map((m) => leer(tenantId, m)));
}

/** Guarda el estado nuevo en la lectura de precios, para que la fila muestre la etiqueta sin releer. */
async function anotarEnLectura(tenantId: string, mla: string, flex: boolean) {
  const ms = await prisma.mapeoCanal.findMany({ where: { tenantId, canal: "mercadolibre", clave: { startsWith: `${mla}|` } }, select: { id: true, precioLectura: true } });
  for (const m of ms) {
    if (!m.precioLectura || typeof m.precioLectura !== "object") continue;
    await prisma.mapeoCanal.update({ where: { id: m.id }, data: { precioLectura: { ...(m.precioLectura as Record<string, unknown>), flex } as Prisma.InputJsonValue } });
  }
}

/** Prende o apaga Flex en varias publicaciones, una por una: manda, verifica y registra. */
export async function cambiarFlex(tenantId: string, mlas: string[], prender: boolean, usuario: string | null): Promise<ResultadoFlex[]> {
  const out: ResultadoFlex[] = [];
  for (const mla of mlas) {
    const antes = await leer(tenantId, mla);
    let estado: ResultadoFlex["estado"] = "aplicado";
    let motivo: string | null = null;
    let respuesta: unknown = null;
    let despues = antes;
    if (antes.flex === prender) {
      estado = "sin_efecto";
      motivo = prender ? "ya tenía Flex" : "ya estaba sin Flex";
    } else if (prender && !antes.disponible) {
      estado = "error";
      motivo = "ML no ofrece Flex para esta publicación";
    } else {
      try {
        respuesta = (await mlFetch(tenantId, `/flex/sites/MLA/items/${mla}/v2`, { method: prender ? "POST" : "DELETE" })) ?? null;
        despues = await leer(tenantId, mla);
        if (despues.flex !== prender) {
          estado = "sin_efecto";
          motivo = "ML contestó bien pero la publicación no cambió";
        } else await anotarEnLectura(tenantId, mla, prender);
      } catch (e) {
        estado = "error";
        motivo = e instanceof Error ? e.message : String(e);
        respuesta = { error: motivo };
      }
    }
    await prisma.cambioFlex.create({
      data: { tenantId, mla, antes: antes.flex, despues: prender, estado, respuesta: (respuesta ?? Prisma.JsonNull) as Prisma.InputJsonValue, usuario },
    });
    out.push({ ...despues, estado, motivo });
  }
  return out;
}
