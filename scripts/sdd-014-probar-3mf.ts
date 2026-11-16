/**
 * docs/sdd/014 — pruebas puras de la lectura de 3MF (`src/lib/leer-3mf.ts`).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/sdd-014-probar-3mf.ts [ruta a un 3MF real…]
 *
 * Los casos se arman en memoria con la misma estructura que deja Bambu Studio (el
 * `model_settings.config` y el `slice_info.config` reales, recortados). Si se pasan rutas, además
 * se leen esos archivos y se muestra lo que salió, para comparar con Bambu Studio.
 */
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "three/examples/jsm/libs/fflate.module.js";
import { leer3mf, nombreDePlaca } from "@/lib/leer-3mf";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

const PNG = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n]);
const ajustes = (placas: Array<[number, string]>) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${placas
    .map(
      ([n, nombre]) =>
        `  <plate>\n    <metadata key="plater_id" value="${n}"/>\n    <metadata key="plater_name" value="${nombre}"/>\n    <metadata key="thumbnail_file" value="Metadata/plate_${n}.png"/>\n  </plate>`
    )
    .join("\n")}\n</config>\n`;
const laminado = (placas: Array<[number, number, number]>) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n    <header_item key="X-BBL-Client-Type" value="slicer"/>\n  </header>\n${placas
    .map(
      ([n, seg, gr]) =>
        `  <plate>\n    <metadata key="index" value="${n}"/>\n    <metadata key="prediction" value="${seg}"/>\n    <metadata key="weight" value="${gr}"/>\n    <filament id="1" type="PLA" used_g="${gr}"/>\n  </plate>`
    )
    .join("\n")}\n</config>\n`;
const SIN_LAMINAR = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n    <header_item key="X-BBL-Client-Type" value="slicer"/>\n  </header>\n</config>\n`;
const MODELO = strToU8("<model>…muchos triángulos…</model>".repeat(1000));

// 1. Como Jabonera.3mf: varias placas sin nombre y sin laminar.
{
  const zip = zipSync({
    "3D/3dmodel.model": MODELO,
    "Metadata/model_settings.config": strToU8(ajustes([[1, ""], [2, ""], [3, ""]])),
    "Metadata/slice_info.config": strToU8(SIN_LAMINAR),
    "Metadata/plate_1.png": PNG(1),
    "Metadata/plate_2.png": PNG(2),
    "Metadata/plate_3.png": PNG(3),
    "Metadata/plate_1_small.png": PNG(11),
    "Metadata/plate_no_light_1.png": PNG(21),
  });
  const r = leer3mf(zip);
  ok(r.placas.length === 3, "sin laminar: encuentra las 3 placas", r.placas.map((p) => p.n));
  ok(r.placas.every((p) => p.gramos === null && p.segundos === null), "sin laminar: sin gramos ni tiempo");
  ok(r.gramos === null && r.segundos === null, "sin laminar: el total tampoco");
  ok(r.placas[1].miniatura?.[4] === 2, "cada placa trae su miniatura (plate_2.png, no la small ni la no_light)");
  ok(nombreDePlaca(r.placas[2]) === "Placa 3", "una placa sin nombre se llama \"Placa n\"");
  ok(r.miniatura?.[4] === 1, "la miniatura del archivo es la de la placa 1");
}

// 2. Laminado con nombres: gramos y tiempo por placa y la suma (como suma la Bodega).
{
  const zip = zipSync({
    "3D/3dmodel.model": MODELO,
    "Metadata/model_settings.config": strToU8(ajustes([[1, "Duna"], [2, "Brisa"]])),
    "Metadata/slice_info.config": strToU8(laminado([[1, 3600, 40.5], [2, 5400, 52.257]])),
    "Metadata/plate_1.png": PNG(1),
    "Metadata/plate_2.png": PNG(2),
  });
  const r = leer3mf(zip);
  ok(r.placas.map(nombreDePlaca).join(",") === "Duna,Brisa", "usa el nombre de la placa de Bambu Studio", r.placas);
  ok(r.placas[0].gramos === 40.5 && r.placas[0].segundos === 3600, "placa 1: 40,5 g y 1 h", r.placas[0]);
  ok(r.placas[1].gramos === 52.26, "los gramos se redondean a centésimos", r.placas[1]);
  ok(r.gramos === 92.76 && r.segundos === 9000, "el total suma las placas, como la Bodega", { g: r.gramos, s: r.segundos });
}

// 3. Sólo una placa laminada de dos: el total es la laminada; la otra queda vacía.
{
  const zip = zipSync({
    "Metadata/model_settings.config": strToU8(ajustes([[1, ""], [2, ""]])),
    "Metadata/slice_info.config": strToU8(laminado([[2, 1200, 10]])),
  });
  const r = leer3mf(zip);
  ok(r.placas[0].gramos === null && r.placas[1].gramos === 10, "placa sin laminar vacía, la laminada con sus datos", r.placas);
  ok(r.gramos === 10 && r.segundos === 1200, "el total es sólo lo laminado");
  ok(r.miniatura === null, "sin png, sin miniatura");
}

// 4. Sin model_settings (otro programa): las placas salen de las miniaturas.
{
  const zip = zipSync({
    "3D/3dmodel.model": MODELO,
    "Metadata/plate_1.png": PNG(1),
    "Metadata/plate_4.png": PNG(4),
    "Auxiliaries/.thumbnails/thumbnail_middle.png": PNG(9),
  });
  const r = leer3mf(zip);
  ok(r.placas.map((p) => p.n).join(",") === "1,4", "sin model_settings, las placas salen de plate_<n>.png", r.placas.map((p) => p.n));
  ok(r.miniatura?.[4] === 9, "prefiere la thumbnail_middle de Auxiliaries, como la Bodega");
}

// 5. Lo que no es un 3MF.
{
  const r = leer3mf(strToU8("solid cubo\nfacet normal 0 0 1\nendsolid cubo\n"));
  ok(r.placas.length === 0 && r.miniatura === null && r.gramos === null, "un STL (no es zip) no rompe: vuelve vacío");
  const r2 = leer3mf(zipSync({ "3D/3dmodel.model": MODELO }));
  ok(r2.placas.length === 0 && r2.miniatura === null, "un 3MF sin Metadata vuelve vacío");
}

// 6. No descomprime los modelos: el filtro deja afuera 3D/3dmodel.model.
{
  const grande = new Uint8Array(30 * 1024 * 1024); // 30 MB de ceros, comprime a casi nada
  const zip = zipSync({ "3D/3dmodel.model": grande, "Metadata/model_settings.config": strToU8(ajustes([[1, "x"]])) });
  const antes = process.memoryUsage().arrayBuffers;
  const t = Date.now();
  const r = leer3mf(zip);
  const ms = Date.now() - t;
  const crecio = (process.memoryUsage().arrayBuffers - antes) / 1024 / 1024;
  ok(r.placas.length === 1 && crecio < 20, `no descomprime el modelo (${ms} ms, +${crecio.toFixed(1)} MB)`, { crecio });
}

// Archivos reales, si se pasaron.
for (const ruta of process.argv.slice(2)) {
  const t = Date.now();
  const r = leer3mf(new Uint8Array(readFileSync(ruta)));
  console.log(
    `\n${ruta} (${Date.now() - t} ms): ${r.placas.length} placas, ${r.gramos ?? "sin"} g, ${r.segundos ?? "sin"} s, miniatura ${r.miniatura ? `${r.miniatura.length} B` : "no"}`
  );
  for (const p of r.placas) console.log(`  ${nombreDePlaca(p)}: ${p.gramos ?? "-"} g, ${p.segundos ?? "-"} s, miniatura ${p.miniatura ? `${p.miniatura.length} B` : "no"}`);
}

console.log(`\n${pruebas - fallas} de ${pruebas} bien`);
process.exit(fallas ? 1 : 0);
