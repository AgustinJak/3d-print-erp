/**
 * docs/sdd/017, TASK-001 — baja por la API de ML la etiqueta de UN envío "para imprimir" y la compara
 * con una bajada de la web. Con el OK de Agustín (2026-11-20): bajarla la marca como impresa en ML.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-017-prueba-etiqueta.ts <archivo de la web> [--guardar <carpeta>]
 *
 * Nunca muestra el contenido (tiene datos del comprador): sólo medidas, cantidades y sí/no. Con
 * --guardar deja el ZPL en esa carpeta para imprimirlo desde la Bodega, como una bajada de la web.
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import { enviosParaDespachar } from "@/lib/envios-para-despachar";
import { etiquetasZpl } from "@/lib/etiquetas-ml";

/** Lo mismo que mira la Bodega: bloques que dibujan, Flex, y cuánto ocupa el dibujo (sin leer ^FD). */
function analizar(txt: string) {
  const bloques = txt.split(/(?=\^XA)/).filter((b) => b.trim().startsWith("^XA"));
  const etiquetas = bloques.filter((b) => /\^FO/.test(b) || /\^FD/.test(b));
  const plano = (b: string) => b.replace(/_[0-9A-Fa-f]{2}/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const flex = etiquetas.filter((b) => /\^fd[^^]*env\w{0,2}o flex/.test(plano(b))).length;
  let alto = 0;
  let ancho = 0;
  let lhy = 0;
  let lhx = 0;
  let y = 0;
  let x = 0;
  let fuente = 25;
  for (const m of txt.matchAll(/\^(LH|FO|A0|GB|BC|FS)([^^]*)/g)) {
    const n = (i: number) => Number(m[2].split(",")[i]) || 0;
    if (m[1] === "LH") [lhx, lhy] = [n(0), n(1)];
    else if (m[1] === "FO") [x, y] = [lhx + n(0), lhy + n(1)];
    else if (m[1] === "A0") alto = Math.max(alto, y + (fuente = n(1) || 25));
    else if (m[1] === "GB") {
      alto = Math.max(alto, y + Math.max(n(1), 1));
      ancho = Math.max(ancho, x + n(0));
    } else if (m[1] === "BC") alto = Math.max(alto, y + (n(1) || 100));
  }
  void fuente;
  const comandos = new Set([...txt.matchAll(/\^([A-Z][A-Z0-9])/g)].map((m) => m[1]));
  return { etiquetas: etiquetas.length, bloques: bloques.length, flex, altoCm: +((alto / 203) * 2.54).toFixed(1), anchoCm: +((ancho / 203) * 2.54).toFixed(1), comandos };
}

async function main() {
  const web = process.argv[2];
  const iGuardar = process.argv.indexOf("--guardar");
  const carpeta = iGuardar > 0 ? process.argv[iGuardar + 1] : null;

  const { envios } = await enviosParaDespachar();
  const listas = envios.filter((e) => e.estado === "lista" && e.envioId);
  console.log(`para imprimir: ${listas.length}`);
  if (listas.length !== 1) {
    console.log("Se esperaba exactamente un envío para imprimir; no se baja nada.");
    return;
  }
  const e = listas[0];
  console.log(`envío ${e.envioId} · ${e.flex ? "Flex" : "normal"} · ${e.productos.map((p) => `${p.nombre} x${p.cantidad}`).join(" + ")}`);

  const { zpl } = await etiquetasZpl([e.envioId!]);
  const api = analizar(zpl);
  const nombre = e.productos[0]?.nombre.split("·")[0].trim().toLowerCase() ?? "";
  const clave = nombre.split(" ").filter((w) => w.length >= 4).slice(-1)[0] ?? nombre;
  console.log(`\nAPI: ${zpl.length} bytes · ${api.etiquetas} etiquetas en ${api.bloques} bloques · Flex ${api.flex} · dibujo ${api.anchoCm} x ${api.altoCm} cm`);
  console.log(`  trae el nombre del producto («${clave}») en algún campo: ${zpl.toLowerCase().includes(clave) ? "sí" : "no"}`);

  if (web) {
    const txt = readFileSync(web, "latin1");
    const w = analizar(txt);
    console.log(`WEB: ${txt.length} bytes · ${w.etiquetas} etiquetas en ${w.bloques} bloques · Flex ${w.flex} · dibujo ${w.anchoCm} x ${w.altoCm} cm`);
    const soloWeb = [...w.comandos].filter((c) => !api.comandos.has(c));
    const soloApi = [...api.comandos].filter((c) => !w.comandos.has(c));
    console.log(`  comandos sólo en la web: ${soloWeb.join(" ") || "ninguno"} · sólo en la API: ${soloApi.join(" ") || "ninguno"}`);
  }

  const despues = await mlFetch<{ status?: string; substatus?: string }>("sendero3d", `/shipments/${e.envioId}`);
  console.log(`\nestado en ML después de bajarla: ${despues.status}/${despues.substatus}`);

  if (carpeta) {
    const destino = join(carpeta, `Etiqueta API ${e.envioId}.txt`);
    writeFileSync(destino, zpl, "latin1");
    console.log(`guardada para imprimir: ${destino}`);
  }
}

main().finally(() => prisma.$disconnect());
