/**
 * docs/sdd/014, etapa 1 — pasa los archivos 3D a la biblioteca privada del ERP.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json \
 *     scripts/sdd-014-migrar-archivos.ts [--prueba] [--solo-local | --solo-publico] [--carpeta <ruta>]
 *
 * Dos orígenes:
 * - **Local:** `%APPDATA%\bodega-3d\storage\models\<id de pieza>\` en la PC del taller. Cada carpeta
 *   con pieza en la nube sube su archivo (uno por carpeta) y su miniatura, y la pieza queda
 *   enganchada (`piezas_archivo`). Las carpetas sin pieza en la nube quedan afuera (Agustín,
 *   2026-11-16). No se borra ni se cambia nada de la PC.
 * - **Público:** el bucket `modelos-3d`. Sus archivos se copian a la biblioteca; si el producto que
 *   lo usa tiene una sola pieza y esa pieza no tiene archivo, se engancha. `modelos.archivo_3mf_url`
 *   no se toca acá: se deja de usar desde la pantalla.
 *
 * Se puede correr las veces que haga falta: lo que ya está (mismo sha256) no se vuelve a subir, y
 * una subida cortada (fila sin confirmar) se rehace.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import { BUCKET, seguro } from "@/lib/tareas";
import { extensionDe } from "@/lib/tareas-reglas";
import { leer3mf } from "@/lib/leer-3mf";

const TENANT = "sendero3d";
// Las carpetas de la biblioteca (Agustín, 2026-11-16: nada de nombres técnicos).
const CARPETA_PIEZAS = "Modelos";
const CARPETA_SIN_USAR = "Sin usar";
/** Lo que falló, para el resumen del final: una falla no frena el resto. */
const FALLAS: string[] = [];
const EXTENSIONES_3D = new Set([".3mf", ".stl", ".obj", ".step", ".stp"]);

const args = process.argv.slice(2);
const PRUEBA = args.includes("--prueba");
const SOLO_LOCAL = args.includes("--solo-local");
const SOLO_PUBLICO = args.includes("--solo-publico");
const iCarpeta = args.indexOf("--carpeta");
const CARPETA_BODEGA =
  iCarpeta >= 0 ? args[iCarpeta + 1] : join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "bodega-3d", "storage", "models");

const storage = () => getSupabaseAdmin().storage.from(BUCKET);
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const tipoDe = (nombre: string) => (extensionDe(nombre) === "3mf" ? "model/3mf" : extensionDe(nombre) === "stl" ? "model/stl" : "application/octet-stream");

interface PlacaGuardada {
  n: number;
  nombre: string;
  miniatura: string | null;
  gramos: number | null;
  segundos: number | null;
}

async function subir(ruta: string, datos: Uint8Array, contentType: string) {
  const { error } = await storage().upload(ruta, datos, { contentType, upsert: true });
  if (error) throw new Error(`${ruta}: ${error.message}`);
}

/**
 * Sube un archivo a la biblioteca y devuelve su id. Si ya hay uno confirmado con el mismo sha256,
 * devuelve ese sin subir nada.
 */
async function aLaBiblioteca(
  a: { nombre: string; datos: Uint8Array; carpeta: string; etiquetas: string[]; miniaturaAparte?: Uint8Array | null },
  hash: string
): Promise<{ id: string; nuevo: boolean }> {
  const existente = await prisma.archivo3d.findFirst({ where: { tenantId: TENANT, hash, subido: true }, select: { id: true } });
  if (existente) return { id: existente.id, nuevo: false };

  // Una subida cortada de una corrida anterior: se borra y se rehace.
  const cortadas = await prisma.archivo3d.findMany({ where: { tenantId: TENANT, hash, subido: false } });
  for (const c of cortadas) {
    const rutas = [c.ruta, c.miniaturaRuta].filter((r): r is string => !!r);
    if (rutas.length) await storage().remove(rutas);
    await prisma.archivo3d.delete({ where: { id: c.id } });
  }

  const fila = await prisma.archivo3d.create({
    data: {
      tenantId: TENANT,
      nombre: a.nombre,
      ruta: "",
      tamano: BigInt(a.datos.length),
      extension: extensionDe(a.nombre) || null,
      carpeta: a.carpeta,
      etiquetas: a.etiquetas,
      subidoPor: "migración SDD 014",
      hash,
    },
  });
  const base = `${TENANT}/${fila.id}`;
  const ruta = `${base}/${seguro(a.nombre)}`;
  await prisma.archivo3d.update({ where: { id: fila.id }, data: { ruta } });
  await subir(ruta, a.datos, tipoDe(a.nombre));

  // Placas y miniaturas: sólo de los 3MF.
  let placas: PlacaGuardada[] | null = null;
  let miniaturaRuta: string | null = null;
  if (extensionDe(a.nombre) === "3mf") {
    const l = leer3mf(a.datos);
    placas = [];
    for (const p of l.placas) {
      let mini: string | null = null;
      if (p.miniatura?.length) {
        mini = `${base}/placa-${p.n}.png`;
        await subir(mini, p.miniatura, "image/png");
      }
      placas.push({ n: p.n, nombre: p.nombre, miniatura: mini, gramos: p.gramos, segundos: p.segundos });
    }
    const mini = a.miniaturaAparte?.length ? a.miniaturaAparte : l.miniatura;
    if (mini?.length) {
      miniaturaRuta = `${base}/miniatura.png`;
      await subir(miniaturaRuta, mini, "image/png");
    }
  } else if (a.miniaturaAparte?.length) {
    miniaturaRuta = `${base}/miniatura.png`;
    await subir(miniaturaRuta, a.miniaturaAparte, "image/png");
  }

  await prisma.archivo3d.update({
    where: { id: fila.id },
    data: { subido: true, miniaturaRuta, placas: placas ? (placas as unknown as Prisma.InputJsonValue) : undefined, actualizadoEn: new Date() },
  });
  return { id: fila.id, nuevo: true };
}

async function enganchar(bodegaModelId: string, archivoId: string) {
  await prisma.piezaArchivo.upsert({
    where: { bodegaModelId },
    create: { bodegaModelId, tenantId: TENANT, archivoId, placa: null },
    update: {},
  });
}

/* ─── Local: la carpeta de la Bodega ─── */

async function migrarLocal() {
  console.log(`\n== Local: ${CARPETA_BODEGA}`);
  if (!existsSync(CARPETA_BODEGA)) {
    console.log("   No existe la carpeta: se saltea.");
    return;
  }
  const piezas = await prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM public.bodega_models`;
  const nombreDePieza = new Map(piezas.map((p) => [p.id, p.name]));
  const enganchadas = new Set((await prisma.piezaArchivo.findMany({ select: { bodegaModelId: true } })).map((p) => p.bodegaModelId));

  const carpetas = readdirSync(CARPETA_BODEGA, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const afuera: string[] = [];
  const revisar: string[] = [];
  let total = 0;
  let subidos = 0;
  let reusados = 0;
  let yaEstaban = 0;

  for (const id of carpetas.sort()) {
    const dir = join(CARPETA_BODEGA, id);
    const archivos3d = readdirSync(dir).filter((f) => EXTENSIONES_3D.has(extname(f).toLowerCase()) && statSync(join(dir, f)).isFile());
    if (!nombreDePieza.has(id)) {
      afuera.push(`${id} (${archivos3d.join(", ") || "sin archivo 3D"})`);
      continue;
    }
    if (archivos3d.length !== 1) {
      revisar.push(`${nombreDePieza.get(id)}: ${archivos3d.length} archivos 3D (${archivos3d.join(", ")})`);
      continue;
    }
    const nombre = archivos3d[0];
    const tamano = statSync(join(dir, nombre)).size;
    total += tamano;
    if (enganchadas.has(id)) {
      yaEstaban++;
      continue;
    }
    if (PRUEBA) {
      console.log(`   subiría ${nombreDePieza.get(id)} ← ${nombre} (${mb(tamano)})`);
      continue;
    }
    const datos = new Uint8Array(readFileSync(join(dir, nombre)));
    const miniatura = ["preview.png", "thumbnail.png"].map((m) => join(dir, m)).find(existsSync);
    const t = Date.now();
    let r: { id: string; nuevo: boolean };
    try {
      r = await aLaBiblioteca(
        { nombre, datos, carpeta: CARPETA_PIEZAS, etiquetas: [], miniaturaAparte: miniatura ? new Uint8Array(readFileSync(miniatura)) : null },
        sha256(datos)
      );
      await enganchar(id, r.id);
    } catch (e) {
      FALLAS.push(`${nombreDePieza.get(id)} ← ${nombre} (${mb(tamano)}): ${e instanceof Error ? e.message : e}`);
      console.log(`   FALLÓ: ${nombreDePieza.get(id)} ← ${nombre}`);
      continue;
    }
    if (r.nuevo) subidos++;
    else reusados++;
    console.log(`   ${r.nuevo ? "subido" : "ya estaba (mismo archivo)"}: ${nombreDePieza.get(id)} ← ${nombre} (${mb(tamano)}, ${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }

  console.log(`\n   Carpetas: ${carpetas.length}. Con pieza y un archivo: ${carpetas.length - afuera.length - revisar.length} (${mb(total)}).`);
  console.log(`   ${PRUEBA ? "Por subir" : "Subidos"}: ${PRUEBA ? carpetas.length - afuera.length - revisar.length - yaEstaban : subidos}. Reusados: ${reusados}. Ya enganchadas antes: ${yaEstaban}.`);
  console.log(`   Quedan afuera (sin pieza en la nube): ${afuera.length}`);
  for (const a of afuera) console.log(`     - ${a}`);
  if (revisar.length) {
    console.log(`   Para revisar a mano: ${revisar.length}`);
    for (const r of revisar) console.log(`     - ${r}`);
  }
}

/* ─── Público: el bucket modelos-3d ─── */

async function migrarPublico() {
  console.log("\n== Bucket público modelos-3d");
  const objetos: Array<{ name: string; size: number }> = [];
  for (let desde = 0; ; desde += 100) {
    const { data, error } = await getSupabaseAdmin().storage.from("modelos-3d").list("", { limit: 100, offset: desde });
    if (error) throw new Error(error.message);
    const archivos = (data ?? []).filter((o) => o.id); // las carpetas vienen sin id
    objetos.push(...archivos.map((o) => ({ name: o.name, size: Number((o.metadata as { size?: number } | null)?.size ?? 0) })));
    if ((data ?? []).length < 100) break;
  }

  const productos = await prisma.$queryRaw<Array<{ id: string; nombre: string; url: string; piezas: string[] }>>`
    SELECT mo.id, mo.nombre, mo.archivo_3mf_url AS url,
           COALESCE(array_agg(s.bodega_model_id) FILTER (WHERE s.bodega_model_id IS NOT NULL), '{}') AS piezas
    FROM public.modelos mo LEFT JOIN public.stock s ON s.modelo_id = mo.id
    WHERE mo.tenant_id = ${TENANT} AND mo.archivo_3mf_url LIKE '%/modelos-3d/%'
    GROUP BY mo.id, mo.nombre, mo.archivo_3mf_url`;
  const productosDe = (objeto: string) => productos.filter((p) => decodeURIComponent(p.url.split("/modelos-3d/")[1] ?? "") === objeto);
  const enganchadas = new Set((await prisma.piezaArchivo.findMany({ select: { bodegaModelId: true } })).map((p) => p.bodegaModelId));

  let total = 0;
  let subidos = 0;
  let reusados = 0;
  let piezasEnganchadas = 0;
  for (const o of objetos) {
    total += o.size;
    const usan = productosDe(o.name);
    const destino = usan.length ? usan.map((p) => p.nombre).join(", ") : "ningún producto";
    if (PRUEBA) {
      console.log(`   copiaría ${o.name} (${mb(o.size)}) → ${destino}`);
      continue;
    }
    let r: { id: string; nuevo: boolean };
    try {
      const { data, error } = await getSupabaseAdmin().storage.from("modelos-3d").download(o.name);
      if (error || !data) throw new Error(error?.message ?? "no bajó");
      const datos = new Uint8Array(await data.arrayBuffer());
      r = await aLaBiblioteca(
        { nombre: o.name, datos, carpeta: usan.length ? CARPETA_PIEZAS : CARPETA_SIN_USAR, etiquetas: usan.map((p) => p.nombre) },
        sha256(datos)
      );
    } catch (e) {
      FALLAS.push(`${o.name} (${mb(o.size)}): ${e instanceof Error ? e.message : e}`);
      console.log(`   FALLÓ: ${o.name}`);
      continue;
    }
    if (r.nuevo) subidos++;
    else reusados++;
    // El mismo archivo puede estar repetido en el bucket con otro nombre: si esta copia es de un
    // producto, el archivo pasa a Modelos y suma el nombre del producto a sus etiquetas.
    if (usan.length) {
      const a = await prisma.archivo3d.findUnique({ where: { id: r.id }, select: { etiquetas: true } });
      const etiquetas = [...new Set([...(a?.etiquetas ?? []), ...usan.map((p) => p.nombre)])].slice(0, 20);
      await prisma.archivo3d.update({ where: { id: r.id }, data: { carpeta: CARPETA_PIEZAS, etiquetas } });
    }
    // Un producto con una sola pieza que todavía no tiene archivo: se engancha.
    for (const p of usan) {
      if (p.piezas.length === 1 && !enganchadas.has(p.piezas[0])) {
        await enganchar(p.piezas[0], r.id);
        enganchadas.add(p.piezas[0]);
        piezasEnganchadas++;
      }
    }
    console.log(`   ${r.nuevo ? "copiado" : "ya estaba (mismo archivo)"}: ${o.name} (${mb(o.size)}) → ${destino}`);
  }
  console.log(`\n   Objetos: ${objetos.length} (${mb(total)}). Productos que lo usan: ${productos.length}.`);
  if (!PRUEBA) console.log(`   Copiados: ${subidos}. Ya estaban: ${reusados}. Piezas enganchadas: ${piezasEnganchadas}.`);
}

async function main() {
  console.log(PRUEBA ? "MODO PRUEBA: no se sube ni se escribe nada." : "Subiendo.");
  if (!SOLO_PUBLICO) await migrarLocal();
  if (!SOLO_LOCAL) await migrarPublico();
  if (FALLAS.length) {
    console.log(`\nFallaron ${FALLAS.length} (correr de nuevo los retoma):`);
    for (const f of FALLAS) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else console.log("\nSin fallas.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
