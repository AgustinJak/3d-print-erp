/**
 * Las reglas del copiador de publicaciones entre cuentas de ML (docs/sdd/010, TASK-007) que valen
 * igual en el servidor y en la pantalla. Sin base ni red.
 */

/** Lo que ML no deja tocar al crear (lo calcula ML): se saltea al copiar. Medido el 2026-11-12. */
export const ATRIBUTOS_QUE_NO_SE_COPIAN = new Set(["UNITS_PER_PACKAGE", "PATTERN_NAME", "AGE_GROUP", "IS_EMERGING_BRAND", "IS_NEW_OFFER", "PACKAGE_DATA_SOURCE", "SELLER_PACKAGE_DATA_SOURCE", "PACKAGE_HEIGHT", "PACKAGE_LENGTH", "PACKAGE_WEIGHT", "PACKAGE_WIDTH", "SYI_PYMES_ID", "GIFTABLE", "IS_HIGHLIGHT_BRAND", "IS_TOM_BRAND"]);

/** Un atributo como lo devuelve `GET /items/{id}?include_attributes=all`. */
export interface AtributoMl {
  id?: string | null;
  name?: string | null;
  value_id?: string | null;
  value_name?: string | null;
  value_type?: string | null;
  values?: Array<{ id?: string | null; name?: string | null; struct?: { number: number; unit: string } | null }> | null;
}

/** Lo que ML calcula y no deja tocar: los de la lista y los FILTRABLE_ (avisa "not modifiable"). */
const loCalculaMl = (id: string) => ATRIBUTOS_QUE_NO_SE_COPIAN.has(id) || id.startsWith("FILTRABLE_");

/**
 * Los atributos de la original en la forma que acepta la cuenta de destino. Medido el 2026-11-12
 * con `/items/validate` en Sendero Shop:
 * - Sin id (un "Color" suelto de la publicación) ML lo rechaza: no se copia.
 * - "-1" es "No aplica": va tal cual.
 * - Las medidas (number_unit, number) van como texto con unidad ("10 cm"): con el código solo, ML
 *   dice "Struct or text must be present" y rechaza el valor.
 * - Los de texto (string) van por nombre: el código puede ser un valor propio de la cuenta principal
 *   que la otra no conoce (el Personaje "Tokito Muichiro").
 * - Los de lista, color o sí/no van con código y nombre: el código del Color principal de la
 *   original tampoco lo conoce la otra cuenta, y con el nombre al lado ML lo resuelve.
 * - Con varios valores, van todos en `values`.
 * - Si la categoría ya no tiene el código de la original (el "2 plazas" viejo de los Porta Sábanas),
 *   va el código que hoy tiene ese mismo nombre; si no hay ninguno, sólo el nombre. `valores` son los
 *   de `/categories/{id}/attributes`, por atributo; sin ellos, va lo de la original.
 */
export function atributosParaCopiar(atributos: AtributoMl[], valores?: ValoresDeCategoria): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const a of atributos) {
    const id = a.id?.trim();
    if (!id || loCalculaMl(id)) continue;
    const propios = (a.values ?? []).filter((v) => v.id || v.name || v.struct);
    const struct = propios[0]?.struct;
    const nombre = a.value_name?.trim() || propios[0]?.name?.trim() || (struct ? `${struct.number} ${struct.unit}` : "");
    const codigo = a.value_id?.trim() || "";
    const tipo = a.value_type ?? "";
    const vigente = (cod: string | null | undefined, nom: string | null | undefined) => {
      const lista = valores?.get(id);
      if (!lista?.length || (cod && lista.some((v) => v.id === cod))) return { cod: cod || "", nom: nom || "" };
      const igual = nom ? lista.find((v) => normal(v.name) === normal(nom)) : undefined;
      return igual ? { cod: igual.id, nom: igual.name } : { cod: "", nom: nom || "" };
    };
    if (codigo === "-1") out.push({ id, value_id: "-1" });
    else if (!codigo && !nombre) continue;
    else if (tipo === "number_unit" || tipo === "number") {
      if (nombre) out.push({ id, value_name: nombre });
    } else if (propios.length > 1) {
      out.push({
        id,
        values: propios.map((v) => {
          if (tipo === "string") return { name: v.name };
          const { cod, nom } = vigente(v.id, v.name);
          return { ...(cod ? { id: cod } : {}), ...(nom ? { name: nom } : {}) };
        }),
      });
    } else if (tipo === "string" && nombre) out.push({ id, value_name: nombre });
    else {
      const { cod, nom } = vigente(codigo, nombre);
      if (cod || nom) out.push({ id, ...(cod ? { value_id: cod } : {}), ...(nom ? { value_name: nom } : {}) });
    }
  }
  return out;
}

/** Los valores que hoy acepta cada atributo de una categoría (los de lista). */
export type ValoresDeCategoria = Map<string, Array<{ id: string; name: string }>>;

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
