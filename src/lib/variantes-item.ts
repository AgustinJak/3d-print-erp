/**
 * Las variantes de una línea de pedido, al abrirla y al guardarla desde el
 * diálogo de edición.
 *
 * El reparto de stock sólo entiende las variantes que traen `matched: true` y
 * `varianteId` (`componentesDeItem` en `reservas.ts`): con eso sabe qué fila de
 * stock le toca a la línea y si lleva funda. El diálogo rearmaba el JSON sólo
 * con nombre y precios, así que editar un pedido —aunque fuera para cambiar una
 * nota— le borraba a la línea su color o su funda para el reparto. Al
 * 2026-10-18 había 50 líneas así, todas de pedidos ya cerrados.
 *
 * Arreglo de paso hasta que la línea guarde la combinación vendible
 * (ver "Mapeo de productos" en el cerebro).
 */

export interface VarianteDelModelo {
  id: string;
  nombre: string;
  precioAdicional: number;
  costoFabAdicional: number;
}

type Entrada = Record<string, unknown>;

const entradas = (variantesInfo: unknown): Entrada[] =>
  Array.isArray(variantesInfo)
    ? variantesInfo.filter((v): v is Entrada => typeof v === "object" && v !== null)
    : [];

/**
 * Qué variantes del modelo tiene elegidas una línea guardada.
 *
 * Por `varianteId` cuando lo hay. Las líneas viejas, escritas por el diálogo
 * antes de este arreglo, sólo tienen el nombre: esas se reconocen por nombre.
 */
export function variantesElegidas(variantesInfo: unknown, variantes: VarianteDelModelo[]): string[] {
  const ids = new Set<string>();
  for (const e of entradas(variantesInfo)) {
    if (e.matched === false) continue; // lo que mandó el canal y no es variante del modelo
    const porId = typeof e.varianteId === "string" ? variantes.find((v) => v.id === e.varianteId) : undefined;
    const porNombre =
      !porId && e.matched === undefined && typeof e.nombre === "string"
        ? variantes.find((v) => v.nombre === e.nombre)
        : undefined;
    const v = porId ?? porNombre;
    if (v) ids.add(v.id);
  }
  return [...ids];
}

/**
 * El `variantesInfo` a guardar para una línea del catálogo.
 *
 * - Cada variante elegida va con `varianteId` y `matched: true`. Si ya estaba
 *   en la línea original, se guarda tal cual estaba (conserva `origen`,
 *   `mlAtributo`, etc.): editar sin tocar las variantes no cambia nada.
 * - Lo que el canal mandó y no es una variante del modelo (`matched: false`, o
 *   el tamaño que el Shop absorbió en el modelo) se conserva como registro,
 *   pero sólo si la línea sigue siendo del mismo modelo. `original` es `null`
 *   cuando el modelo cambió o la línea es nueva.
 */
export function variantesParaGuardar(elegidas: VarianteDelModelo[], original: unknown | null): Entrada[] {
  const previas = entradas(original);
  const out: Entrada[] = [];

  for (const v of elegidas) {
    const igual = previas.find((e) => e.varianteId === v.id && e.matched === true);
    out.push(
      igual ?? {
        nombre: v.nombre,
        varianteId: v.id,
        matched: true,
        precioAdicional: v.precioAdicional,
        costoFabAdicional: v.costoFabAdicional,
        origen: "manual",
      }
    );
  }

  for (const e of previas) {
    if (e.matched === false || e.absorbidaEnElModelo === true) out.push(e);
  }
  return out;
}
