import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";

/**
 * Lo que se puede saber de un 3MF de Bambu Studio u Orca sin abrir los modelos (docs/sdd/014).
 *
 * Es el port de `extract3mfInfo` de la Bodega (`Bodega3D-App/src/main/storage.ts:17`), con dos
 * diferencias: lee **placa por placa** (un 3MF puede tener un diseño por placa, como
 * `Jabonera.3mf` con 17) y corre igual en el navegador y en Node. Sólo descomprime los `.config` y
 * las miniaturas, así un archivo de 229 MB no se descomprime entero.
 *
 * Gramos y tiempo existen sólo si el proyecto se guardó después de laminar: `slice_info.config`
 * trae un `<plate>` por placa laminada con `prediction` (segundos) y `weight` (gramos). Al
 * 2026-11-16 ninguno de los 103 3MF de la Bodega estaba laminado.
 */

export interface Placa {
  /** El número de placa de Bambu Studio (`plater_id`, desde 1). */
  n: number;
  /** El nombre que se le puso en Bambu Studio; vacío si no tiene. */
  nombre: string;
  miniatura: Uint8Array | null;
  gramos: number | null;
  segundos: number | null;
}

export interface Lectura3mf {
  placas: Placa[];
  /** La suma de las placas laminadas; null si ninguna lo está. */
  gramos: number | null;
  segundos: number | null;
  /** La miniatura del archivo entero (la de la placa 1 o la que haya). */
  miniatura: Uint8Array | null;
}

const VACIA: Lectura3mf = { placas: [], gramos: null, segundos: null, miniatura: null };

/** Lo que vale la pena descomprimir: los .config de Metadata y las miniaturas png. */
const sirve = (nombre: string) => {
  const n = nombre.replace(/\\/g, "/");
  return (/^Metadata\/[^/]+\.config$/i.test(n) || /\.png$/i.test(n)) && !/no_light|pick_|top_/i.test(n);
};

const texto = (b: Uint8Array | undefined) => (b ? new TextDecoder("utf-8").decode(b) : "");

/** Los bloques `<plate>…</plate>` de un .config, con sus `<metadata key value>`. */
function placasDe(xml: string): Array<Record<string, string>> {
  return [...xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => {
    const datos: Record<string, string> = {};
    for (const md of m[1].matchAll(/<metadata\s+key\s*=\s*"([^"]+)"\s+value\s*=\s*"([^"]*)"/g)) datos[md[1]] = md[2];
    return datos;
  });
}

const numero = (s: string | undefined) => {
  if (s == null || s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export function leer3mf(data: Uint8Array): Lectura3mf {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(data, { filter: (f) => sirve(f.name) });
  } catch {
    return VACIA; // no es un zip: un STL renombrado, un archivo roto
  }
  const porNombre = new Map(Object.entries(archivos).map(([k, v]) => [k.replace(/\\/g, "/"), v]));
  const buscar = (nombre: string) => porNombre.get(nombre) ?? [...porNombre].find(([k]) => k.toLowerCase() === nombre.toLowerCase())?.[1];

  // Placas: model_settings.config dice cuáles hay y cómo se llaman.
  const ajustes = placasDe(texto(buscar("Metadata/model_settings.config")));
  // Laminado: slice_info.config tiene tiempo y gramos de cada placa laminada.
  const laminado = new Map(
    placasDe(texto(buscar("Metadata/slice_info.config"))).map((p) => [
      numero(p.index) ?? 0,
      { segundos: numero(p.prediction), gramos: numero(p.weight) },
    ])
  );

  const numeros = new Set<number>();
  for (const p of ajustes) {
    const n = numero(p.plater_id);
    if (n) numeros.add(n);
  }
  for (const n of laminado.keys()) if (n) numeros.add(n);
  // Sin model_settings (otro programa): las miniaturas plate_<n>.png dicen cuántas hay.
  if (numeros.size === 0) {
    for (const k of porNombre.keys()) {
      const m = /^Metadata\/plate_(\d+)\.png$/i.exec(k);
      if (m) numeros.add(Number(m[1]));
    }
  }

  const nombres = new Map(ajustes.map((p) => [numero(p.plater_id) ?? 0, (p.plater_name ?? "").trim()]));
  const placas: Placa[] = [...numeros]
    .sort((a, b) => a - b)
    .map((n) => {
      const l = laminado.get(n);
      return {
        n,
        nombre: nombres.get(n) ?? "",
        miniatura: buscar(`Metadata/plate_${n}.png`) ?? null,
        gramos: l?.gramos != null ? redondear2(l.gramos) : null,
        segundos: l?.segundos != null ? Math.round(l.segundos) : null,
      };
    });

  const laminadas = placas.filter((p) => p.gramos != null || p.segundos != null);
  const suma = (k: "gramos" | "segundos") => (laminadas.length ? laminadas.reduce((a, p) => a + (p[k] ?? 0), 0) : null);
  const gramos = suma("gramos");

  // La miniatura del archivo: las que deja el programa, en el mismo orden que la Bodega.
  const candidatas = [
    "Auxiliaries/.thumbnails/thumbnail_middle.png",
    "Metadata/plate_1.png",
    "Auxiliaries/.thumbnails/thumbnail_3mf.png",
    "Auxiliaries/.thumbnails/thumbnail_small.png",
  ];
  const miniatura =
    candidatas.map(buscar).find((b) => b && b.length > 0) ??
    [...porNombre].find(([k, v]) => /(plate_\d+|thumbnail).*\.png$/i.test(k) && v.length > 0)?.[1] ??
    null;

  return { placas, gramos: gramos != null ? redondear2(gramos) : null, segundos: suma("segundos"), miniatura };
}

/** "Placa 3" si no tiene nombre. */
export const nombreDePlaca = (p: Pick<Placa, "n" | "nombre">) => p.nombre || `Placa ${p.n}`;
