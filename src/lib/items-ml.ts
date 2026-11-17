import { mlFetch, type CuentaMl } from "@/lib/mercadolibre";

/**
 * Leer varias publicaciones de ML de una vez (`/items?ids=`, de a 20).
 *
 * El 2026-11-17 ML empezó a rechazar a veces esa consulta con 403 "ResourceDeprecated - client no
 * longer allowed to consume this resource": el mismo pedido, repetido minutos después, anduvo. Es
 * la baja gradual del multiget. Por eso, si un lote falla, sus publicaciones se piden de a una
 * (`/items/{id}`, que sigue andando), y si ML lo da de baja del todo esto sigue funcionando igual,
 * sólo con más llamadas.
 *
 * Devuelve las que se pudieron leer, por id. Las que no existen o fallan de a una, no vienen.
 */
export async function leerItemsMl<T extends { id?: unknown }>(
  tenantId: string,
  ids: string[],
  atributos: string,
  opciones: { cuenta?: CuentaMl; antesDeLeer?: (texto: string) => string; tandas?: number } = {}
): Promise<Map<string, T>> {
  const unicos = [...new Set(ids)];
  const out = new Map<string, T>();
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += 20) lotes.push(unicos.slice(i, i + 20));

  const deAUna = async (lote: string[]) => {
    for (let i = 0; i < lote.length; i += 8) {
      await Promise.all(
        lote.slice(i, i + 8).map(async (id) => {
          try {
            const body = await mlFetch<T>(tenantId, `/items/${id}?attributes=${atributos}`, { cuenta: opciones.cuenta }, opciones.antesDeLeer);
            if (body?.id) out.set(String(body.id), body);
          } catch {
            // Una que falla sola no frena el resto: queda afuera, como en el multiget.
          }
        })
      );
    }
  };

  const tandas = Math.max(1, opciones.tandas ?? 1);
  for (let i = 0; i < lotes.length; i += tandas) {
    await Promise.all(
      lotes.slice(i, i + tandas).map(async (lote) => {
        try {
          const r = await mlFetch<Array<{ code: number; body: T }>>(
            tenantId,
            `/items?ids=${lote.join(",")}&attributes=${atributos}`,
            { cuenta: opciones.cuenta },
            opciones.antesDeLeer
          );
          for (const x of r) if (x.code === 200 && x.body?.id) out.set(String(x.body.id), x.body);
        } catch {
          await deAUna(lote);
        }
      })
    );
  }
  return out;
}
