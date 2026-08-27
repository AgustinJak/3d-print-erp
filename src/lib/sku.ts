/**
 * Generación de SKUs del inventario.
 *
 * El inventario es la **fuente de verdad** del SKU: lo genera acá y se copia a
 * Mercado Libre y al Shop. Antes lo autogeneraba el shop, con lo cual un
 * producto que sólo se vendía en ML nacía sin SKU.
 *
 * Formato:  SS-<LINEA>-<CATEGORIA>-<NNN>
 *
 *   SS-DEM-KAT-002   Demon Slayer · Katanas · #2
 *   SS-BLE-KAT-033   Bleach · Katanas · #33
 *
 * El prefijo `SS` viene de "Sendero Shop", que fue donde nacieron los primeros.
 * Se conserva por compatibilidad con los que ya están cargados en el shop y en
 * ML: renombrarlos obligaría a actualizar los dos canales por cero ganancia.
 * Hoy es una marca histórica sin más significado.
 */

/** Tres letras en mayúscula, sin acentos ni símbolos. */
export function abreviar(texto: string | null | undefined, fallback: string): string {
  if (!texto) return fallback;
  const limpio = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  return limpio.length >= 3 ? limpio.slice(0, 3) : (limpio + fallback).slice(0, 3);
}

/** Siguiente número libre, mirando los SKUs que ya existen. */
export function siguienteNumero(skusExistentes: Array<string | null>): number {
  let max = 0;
  for (const sku of skusExistentes) {
    if (!sku) continue;
    const m = sku.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export interface SugerenciaSku {
  sku: string | null;
  /** Por qué no se pudo generar, si no se pudo. */
  falta?: "serie" | "categoria" | "serie y categoría";
}

/**
 * Propone el SKU de un modelo. Devuelve `sku: null` cuando faltan datos, para
 * que el llamador pida completarlos en vez de inventar un código sin sentido.
 */
export function sugerirSku(
  serie: string | null | undefined,
  categoria: string | null | undefined,
  numero: number,
): SugerenciaSku {
  const sinSerie = !serie?.trim();
  const sinCategoria = !categoria?.trim();
  if (sinSerie && sinCategoria) return { sku: null, falta: "serie y categoría" };
  if (sinSerie) return { sku: null, falta: "serie" };
  if (sinCategoria) return { sku: null, falta: "categoria" };

  const linea = abreviar(serie, "GEN");
  const cat = abreviar(categoria, "VAR");
  return { sku: `SS-${linea}-${cat}-${String(numero).padStart(3, "0")}` };
}
