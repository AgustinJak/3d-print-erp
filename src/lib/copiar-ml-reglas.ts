/**
 * Las reglas del copiador de publicaciones entre cuentas de ML (docs/sdd/010, TASK-007) que valen
 * igual en el servidor y en la pantalla. Sin base ni red.
 */

/** Lo que ML no deja tocar al crear (lo calcula ML): se saltea al copiar. Medido el 2026-11-12. */
export const ATRIBUTOS_QUE_NO_SE_COPIAN = new Set(["PACKAGE_DATA_SOURCE", "PACKAGE_HEIGHT", "PACKAGE_LENGTH", "PACKAGE_WEIGHT", "PACKAGE_WIDTH", "SYI_PYMES_ID", "GIFTABLE", "IS_HIGHLIGHT_BRAND", "IS_TOM_BRAND"]);

/** El nombre de familia (lo que se ve como título) tiene hasta 60 letras, como en Crear en ML. */
export const LARGO_MAXIMO = 60;

/** Lo que el cliente nunca lee, igual que en Crear en ML. */
export const PALABRAS_PROHIBIDAS = [/impresi[oó]n\s*3d/i, /\bimprim/i, /\bimpres[oa]s?\b/i, /\bimpresora/i, /\bPLA\b/, /sendero\s*3d/i, /r[eé]plica/i, /\btipo\b/i, /s[ií]mil/i];

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Por qué no se puede crear la copia con este título (RN-4): igual al original (sin contar
 * mayúsculas, acentos ni espacios), vacío, largo o con palabras que no van de cara al cliente.
 */
export function problemasDelTitulo(original: string, nuevo: string): string[] {
  const p: string[] = [];
  const t = nuevo.trim();
  if (t.length < 3) p.push("Falta el título.");
  if (normal(t) === normal(original)) p.push("Es igual al de Sendero 3D: cambiale la última parte.");
  if (t.length > LARGO_MAXIMO) p.push(`Tiene ${t.length} letras: el máximo es ${LARGO_MAXIMO}.`);
  for (const r of PALABRAS_PROHIBIDAS) if (r.test(t)) p.push(`Dice "${t.match(r)?.[0]}": no va de cara al cliente.`);
  return p;
}

/** Reemplaza las últimas `n` palabras del título por `nuevo` (la ayuda para cambiar el final). */
export function reemplazarFinal(titulo: string, n: number, nuevo: string): string {
  const palabras = titulo.trim().split(/\s+/);
  const quedan = palabras.slice(0, Math.max(0, palabras.length - Math.max(0, n)));
  return [...quedan, nuevo.trim()].filter(Boolean).join(" ");
}
