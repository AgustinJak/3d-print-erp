import { normalizeForMatch } from "@/lib/webhook-security";

/**
 * Variantes "implícitas" de una publicación de Mercado Libre.
 *
 * Muchas publicaciones no tienen variaciones: el tamaño y los accesorios viven
 * únicamente en el título ("Katana + Funda ... 95cm - Sendero 3d Rengoku").
 * Como ML no manda esos atributos en la orden, el pedido entraba con el
 * `costoFab` base y el costo real de fabricación se perdía.
 *
 * Estas funciones proponen, leyendo el título, qué variantes del modelo lleva
 * siempre esa publicación. La sugerencia es sólo eso: el usuario confirma.
 */

export interface VarianteRef {
  id: string;
  nombre: string;
  costoFabAdicional: number;
}

const norm = (s: string) => normalizeForMatch(s);
const colapsar = (s: string) => norm(s).replace(/\s+/g, "");

const esVarianteFunda = (nombre: string) => /funda/.test(norm(nombre));

/**
 * Sugiere las variantes que la publicación lleva implícitas.
 * Devuelve los ids de las variantes del modelo.
 */
export function sugerirVariantesImplicitas(
  titulo: string | null | undefined,
  variantes: VarianteRef[],
): string[] {
  if (!titulo || variantes.length === 0) return [];

  const crudo = titulo.toLowerCase();
  const tituloColapsado = colapsar(titulo);
  const ids = new Set<string>();

  // ── Eje funda ──
  // "Katana + Funda ... " y "con funda" ⇒ lleva funda.
  // "sin funda" ⇒ explícitamente no la lleva.
  const sinFunda = /sin\s*funda/.test(crudo);
  const conFunda = !sinFunda && /(\+\s*funda|con\s*funda)/.test(crudo);

  if (conFunda) {
    const v =
      variantes.find((x) => /^(con)?funda$/.test(colapsar(x.nombre))) ??
      variantes.find((x) => esVarianteFunda(x.nombre) && !/sin/.test(norm(x.nombre)));
    if (v) ids.add(v.id);
  } else if (sinFunda) {
    const v = variantes.find((x) => colapsar(x.nombre) === "sinfunda");
    if (v) ids.add(v.id);
  }

  // ── Resto de los ejes (tamaño, color, material...) ──
  // Si el nombre de la variante aparece tal cual en el título, es implícita.
  // "95cm" matchea con "...Demonios 95cm - Sendero..." aunque ML no lo mande.
  for (const v of variantes) {
    if (esVarianteFunda(v.nombre)) continue; // el eje funda ya se resolvió arriba
    const n = colapsar(v.nombre);
    if (n.length >= 3 && tituloColapsado.includes(n)) ids.add(v.id);
  }

  return [...ids];
}

/** Costo total que suman las variantes indicadas. */
export function costoDeVariantes(ids: string[], variantes: VarianteRef[]): number {
  return ids.reduce((acc, id) => {
    const v = variantes.find((x) => x.id === id);
    return acc + (v?.costoFabAdicional ?? 0);
  }, 0);
}
