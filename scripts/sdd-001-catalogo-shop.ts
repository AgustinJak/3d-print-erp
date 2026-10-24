/**
 * Las decisiones de Agustín sobre el catálogo del Shop (docs/sdd/001, TASK-022 y TASK-013).
 *
 *   npx tsx --env-file=.env scripts/sdd-001-catalogo-shop.ts preparar [--real]
 *   npx tsx --env-file=.env scripts/sdd-001-catalogo-shop.ts mapear <catalogo.json> [--real]
 *   npx tsx --env-file=.env scripts/sdd-001-catalogo-shop.ts lineas [--real]
 *
 * `preparar` va antes de la siembra (`sdd-001-sembrar-shop.ts`): corrige los SKU cruzados
 * del porta bálsamo y el porta latas, y crea los cinco productos del Shop que no existían
 * en el ERP. `mapear` va después: los pares que la siembra no puede deducir sola (otro
 * nombre, una opción que no es variante), cargados como si se eligieran en Integraciones ›
 * Mapeo, o sea `manual`. `lineas` completa las dos líneas viejas que habían entrado sin
 * modelo. Por defecto los tres simulan.
 */
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { asegurarCombinacion, claveDe, sembrarCombinacionesDeModelo } from "@/lib/combinaciones";
import { claveShop, lineaDeCombinacion, mapearClave } from "@/lib/mapeo-canal";
import { reasignarReservas } from "@/lib/reservas";
import { asegurarFilasDeStock } from "@/lib/stock-filas";
import { normalizeForMatch } from "@/lib/webhook-security";

const T = "sendero3d";

/* ─────────────────────────────── preparar ─────────────────────────────── */

/**
 * B7: "Porta balsamo k4os" tenía el SKU del porta latas del Shop. En ML ninguna de las
 * dos publicaciones tiene SKU, así que se alinean con el Shop. El orden importa: el SKU
 * es único y el del porta latas recién queda libre después del primer cambio.
 */
const SKUS: Array<{ modelo: string; de: string; a: string }> = [
  { modelo: "Porta balsamo k4os", de: "SS-K4O-MER-053", a: "SS-K4O-LLA-051" },
  { modelo: "Porta Latas K4os", de: "SS-K4O-KPO-072", a: "SS-K4O-MER-053" },
];

/**
 * C: los cinco productos del Shop sin modelo en el ERP, con el SKU que ya tienen en el
 * Shop y las variantes con el nombre exacto de sus opciones, para que la siembra los
 * resuelva sola. Nacen sin costo: lo trae Bodega cuando la pieza se cree allá con el
 * mismo nombre (el alta automática engancha la fila de stock suelta).
 */
const NUEVOS: Array<{ nombre: string; sku: string; serie: string; grupo?: string; variantes?: string[] }> = [
  { nombre: "Hacha Prime", sku: "SS-VAL-ESP-045", serie: "Valorant" },
  { nombre: "Lucero de Alba", sku: "SS-RE:-ARM-038", serie: "Re:Zero" },
  // El pack no es una variante: lo da el mapeo como unidades (spec 004, RN-8).
  { nombre: "Llavero Ballena 52 Hz", sku: "SS-BTS-LLA-039", serie: "BTS" },
  {
    nombre: "Llavero BT21",
    sku: "SS-BTS-LLA-044",
    serie: "BTS",
    grupo: "Personaje",
    variantes: ["Tata", "Chimmy", "Cooky", "Mang", "Rj", "Shooky", "Koya", "Van"],
  },
  {
    nombre: "Jabonera minimalista",
    sku: "SS-MIN-DEC-040",
    serie: "Minimalista",
    grupo: "Diseño",
    variantes: [
      "Amanecer", "Duna", "Brisa", "Horizonte", "Fluir", "Viento", "Equilibrio", "Capas",
      "Fases", "Cairn", "Órbita", "Símbolo", "Bambú", "Nexo", "Espiral",
    ],
  },
];

/**
 * B2 (2026-10-24): la MiniKatana de Tanjiro roja es "Tanjiro V2 20cm", otra pieza de Bodega. En
 * el ERP estaba desactivada y consolidada en "Tanjiro MiniKatana" (la negra), como si fueran la
 * misma. Se deshace (consolidar sólo marca, no mueve nada) y lleva el SKU que tiene en el Shop.
 */
const REACTIVAR: Array<{ id: string; nombre: string; sku: string }> = [
  { id: "cmmsg5e57001gjp04cz62hy11", nombre: "Tanjiro v2 20cm", sku: "SS-DEM-MIN-017" },
];

async function preparar(real: boolean) {
  for (const r of REACTIVAR) {
    const m = await prisma.modelo.findFirst({ where: { id: r.id, tenantId: T, nombre: r.nombre } });
    if (!m) {
      console.log(`!! no encontré "${r.nombre}"`);
      continue;
    }
    if (m.activo && !m.consolidadoEnId && m.sku === r.sku) {
      console.log(`ya activo: ${r.nombre} (${r.sku})`);
      continue;
    }
    console.log(`reactivar: ${r.nombre}, sin consolidar, SKU ${r.sku}`);
    if (!real) continue;
    await prisma.modelo.update({ where: { id: m.id }, data: { activo: true, consolidadoEnId: null, sku: r.sku } });
    // Lo mismo que PUT /api/modelos/[id] al reactivar: su fila de stock y su combinación.
    await asegurarFilasDeStock(T, m.id);
    await sembrarCombinacionesDeModelo(prisma, T, m.id);
    await prisma.combinacion.updateMany({ where: { tenantId: T, clave: claveDe(m.id, []), sku: null }, data: { sku: r.sku } });
  }

  for (const s of SKUS) {
    const m = await prisma.modelo.findFirst({ where: { tenantId: T, nombre: s.modelo, sku: s.de, activo: true } });
    if (!m) {
      const ya = await prisma.modelo.findFirst({ where: { tenantId: T, nombre: s.modelo, sku: s.a } });
      console.log(ya ? `SKU ya corregido: ${s.modelo} = ${s.a}` : `!! no encontré "${s.modelo}" con ${s.de}`);
      continue;
    }
    // La combinación del modelo solo lleva el mismo SKU que el modelo (skuDe sin sufijos).
    const combo = await prisma.combinacion.findFirst({ where: { tenantId: T, clave: claveDe(m.id, []), sku: s.de } });
    console.log(`SKU ${s.modelo}: ${s.de} → ${s.a}${combo ? ` (y su combinación "${combo.nombre}")` : ""}`);
    if (!real) continue;
    await prisma.$transaction(async (tx) => {
      await tx.modelo.update({ where: { id: m.id }, data: { sku: s.a } });
      if (combo) await tx.combinacion.update({ where: { id: combo.id }, data: { sku: s.a } });
    });
  }

  for (const n of NUEVOS) {
    const ya = await prisma.modelo.findFirst({
      where: { tenantId: T, OR: [{ nombre: { equals: n.nombre, mode: "insensitive" } }, { sku: n.sku }] },
      select: { nombre: true, sku: true },
    });
    if (ya) {
      console.log(`ya existe: "${ya.nombre}" (${ya.sku})`);
      continue;
    }
    console.log(`crear: "${n.nombre}" ${n.sku}${n.variantes ? ` · ${n.variantes.length} variantes` : ""}`);
    if (!real) continue;
    // Lo mismo que POST /api/modelos: el modelo, sus filas de stock y sus combinaciones.
    const m = await prisma.modelo.create({
      data: {
        tenantId: T,
        nombre: n.nombre,
        sku: n.sku,
        serie: n.serie,
        activo: true,
        // Cada diseño es una pieza distinta: tiene su propia fila de stock.
        variantes: n.variantes ? { create: n.variantes.map((v) => ({ nombre: v, afectaStock: true, tipo: "pieza", grupo: n.grupo ?? "Variante" })) } : undefined,
      },
    });
    await asegurarFilasDeStock(T, m.id);
    await sembrarCombinacionesDeModelo(prisma, T, m.id);
  }
}

/* ──────────────────────────────── mapear ──────────────────────────────── */

interface Producto {
  id: string;
  sku: string | null;
  nombre: string;
  grupos: Array<{ id: string; nombre: string; opciones: Array<{ id: string; valor: string }> }>;
}

/** Las opciones elegidas de una clave, por nombre de grupo normalizado. */
type Elegidas = Record<string, string>;
type Destino = { modelo: string; variantes?: string[] } | null;

const tam = (e: Elegidas) => e["tamano"];
const funda = (e: Elegidas) => e["accesorios"] ?? e["accesorio"] ?? e["funda"];

/**
 * Por producto del Shop (nombre exacto), qué es cada combinación de sus opciones.
 * `null` = queda en la cola a propósito.
 */
const PARES: Record<string, (e: Elegidas) => Destino> = {
  // A: el mismo producto con otro nombre o SKU.
  "Espada de Rumi": (e) => ({ modelo: tam(e) === "105cm" ? "Espada Rumi 105cm" : "Espada rumi 65cm" }), // el color no cambia la pieza
  "Katana de Shanks - Gryphon": (e) => ({ modelo: `Shanks ${tam(e)}`, variantes: [funda(e)] }),
  "La casita de BadBunny": () => ({ modelo: "Porta Llaves La casita BadBunny" }),
  "LighStick SajaBoys": () => ({ modelo: "Saja Boys" }),
  "Lightstick Kpop K4os 4rever": () => ({ modelo: "LightStick K4os" }),
  "Llavero Copa del Mundo": () => ({ modelo: "Llavero Copa del mundial" }),
  "Mano Exhibidora de anillos": () => ({ modelo: "Mano exhibidora anillos" }),
  "MiniKatana de Yoiirich": () => ({ modelo: "Minikatana Yoiirichi" }),
  "Porta Auricular Gravity Falls": () => ({ modelo: "Soporte gravity falls" }),
  "Porta Auriculares Nube": (e) => ({ modelo: "Porta auricular NUBE", variantes: [e["color"]] }),
  "Porta Balsamo Labial K4os": () => ({ modelo: "Porta balsamo k4os" }), // negro o violeta, la misma pieza
  "Vaso BTS MilkShake": (e) => ({ modelo: "Vaso Bts", variantes: [e["firma"]] }),
  "Porta Latas Kpop K4os": () => ({ modelo: "Porta Latas K4os" }),
  // B1: la roja es la nueva.
  "Katana de Tanjiro Kamado (Roja)": (e) => ({ modelo: `Tanjiro Katana nueva ${tam(e)}`, variantes: [funda(e)] }),
  // B2: y su minikatana es la V2 de 20 cm.
  "MiniKatana de Tanjiro Kamado (Roja)": () => ({ modelo: "Tanjiro v2 20cm" }),
  // B3: la de 65 no existe; esas dos claves quedan en la cola. Desde el 2026-10-24 el Shop
  // ya no ofrece tamaño: sin tamaño es la de 95.
  "Katana de Tengen Uzui": (e) =>
    !tam(e) || tam(e) === "95cm" ? { modelo: "Tengen Uzui Katana", variantes: [funda(e)] } : null,
  // B4: ya no se vende; si entra una venta, va a la cola.
  "Daga Knight Killer": () => null,
  // B5: el exhibidor no se lleva como pieza.
  "Katana de Zoro - Kitetsu": (e) => ({ modelo: `Zoro Kitetsu Katana ${tam(e)}`, variantes: [funda(e)] }),
  // B6: la del Shop ($13.000) es la chica, como en ML la "Caja Guarda" sin Premium.
  "Caja Guarda - Porta Figuritas Del Mundial Fifa 2026": () => ({ modelo: "Caja chica figuritas" }),
};

function combinacionesDe(p: Producto) {
  let out: Array<Array<{ grupo: string; opcionId: string; valor: string }>> = [[]];
  for (const g of p.grupos.filter((x) => x.opciones.length > 0)) {
    out = out.flatMap((pre) => g.opciones.map((o) => [...pre, { grupo: g.nombre, opcionId: o.id, valor: o.valor }]));
  }
  return out;
}

async function mapear(archivo: string, real: boolean) {
  const catalogo: Producto[] = JSON.parse(fs.readFileSync(archivo, "utf8"));
  let completadas = 0;
  const faltan: string[] = [];

  for (const p of catalogo) {
    const regla = PARES[p.nombre.trim()];
    if (!regla) continue;
    console.log(`\n${p.nombre.trim()}`);
    for (const elegidas of combinacionesDe(p)) {
      const e: Elegidas = Object.fromEntries(elegidas.map((x) => [normalizeForMatch(x.grupo), x.valor]));
      const texto = elegidas.map((x) => `${x.grupo}: ${x.valor}`).join(" · ") || "(sin opciones)";
      const clave = claveShop({ productoId: p.id, nombre: p.nombre, opciones: elegidas.map((x) => ({ opcionId: x.opcionId, nombre: x.valor })) });
      const mapeo = await prisma.mapeoCanal.findUnique({
        where: { tenantId_canal_clave: { tenantId: T, canal: "shop", clave } },
        include: { combinacion: { select: { id: true, nombre: true } } },
      });
      const destino = regla(e);
      if (!destino) {
        console.log(`   ${texto}  queda en la cola`);
        continue;
      }

      const modelo = await prisma.modelo.findFirst({
        where: { tenantId: T, nombre: destino.modelo, activo: true, consolidadoEnId: null },
        select: { id: true, variantes: { where: { activo: true }, select: { id: true, nombre: true } } },
      });
      const ids = (destino.variantes ?? []).map((n) => modelo?.variantes.find((v) => normalizeForMatch(v.nombre) === normalizeForMatch(n))?.id);
      if (!modelo || ids.some((x) => !x)) {
        faltan.push(`${p.nombre} · ${texto} → "${destino.modelo}" ${destino.variantes?.join(", ") ?? ""}`);
        console.log(`   ${texto}  !! no encontré "${destino.modelo}" ${destino.variantes?.join(", ") ?? ""}`);
        continue;
      }
      const nombre = [destino.modelo, ...(destino.variantes ?? [])].join(" · ");
      if (!mapeo) {
        console.log(`   ${texto}  !! la clave no está sembrada (correr antes sdd-001-sembrar-shop.ts --real)`);
        continue;
      }
      if (mapeo.combinacion && mapeo.combinacion.nombre === nombre) {
        console.log(`   ${texto}  ya → ${nombre} (${mapeo.origen})`);
        continue;
      }
      console.log(`   ${texto}  ${mapeo.combinacion ? `${mapeo.combinacion.nombre} → ` : "cola → "}${nombre}`);
      if (!real) continue;
      const c = await asegurarCombinacion(prisma, T, modelo.id, ids as string[]);
      const r = await mapearClave(prisma, T, mapeo.id, { combinacionId: c.id });
      completadas += r.lineasCompletadas;
    }
  }

  if (faltan.length) console.log(`\n!! ${faltan.length} sin destino:\n${faltan.join("\n")}`);
  if (real && completadas > 0) {
    await reasignarReservas(T);
    console.log(`\n${completadas} líneas de pedidos abiertos completadas; reparto corrido.`);
  }
}

/* ──────────────────────────────── lineas ──────────────────────────────── */

/**
 * Las dos líneas del Shop que entraron sin modelo antes del mapeo (SS-00133 y SS-00136).
 * Sus pedidos ya están completados, así que mapear la clave no las toca: se les pone el
 * modelo, la combinación y el costo de la combinación, como si se hubieran resuelto al
 * entrar. Cantidad y precio no cambian, y el stock tampoco: nunca reservaron, y el
 * descuento lo hace el cambio de estado, que ya pasó.
 */
const LINEAS: Array<{ pedido: string; item: string; modelo: string; variantes: string[] }> = [
  { pedido: "SS-00133", item: "cmvfeemp00005l308d2m2gt6k", modelo: "Bola de demolicion  jojos", variantes: [] },
  { pedido: "SS-00136", item: "cmvfyu0dl0003l0088k1ais8t", modelo: "Tanjiro Katana nueva 95cm", variantes: ["Con Funda"] },
];

async function lineas(real: boolean) {
  for (const l of LINEAS) {
    const item = await prisma.itemPedido.findFirst({
      where: { id: l.item, modeloId: null, pedido: { tenantId: T, externoId: l.pedido } },
      select: { id: true, variantesInfo: true },
    });
    if (!item) {
      console.log(`${l.pedido}: la línea ya tiene modelo (o no existe)`);
      continue;
    }
    const modelo = await prisma.modelo.findFirstOrThrow({
      where: { tenantId: T, nombre: l.modelo, activo: true },
      select: { id: true, variantes: { where: { activo: true }, select: { id: true, nombre: true } } },
    });
    const ids = l.variantes.map((n) => modelo.variantes.find((v) => v.nombre === n)!.id);
    const c = await asegurarCombinacion(prisma, T, modelo.id, ids);
    // Lo que mandó el Shop (95cm, Con Funda) se vuelve a cruzar contra la combinación.
    const previas = Array.isArray(item.variantesInfo) ? (item.variantesInfo as Array<Record<string, unknown>>) : [];
    const opciones = previas
      .filter((e) => typeof e?.nombre === "string")
      .map((e) => ({ nombre: e.nombre as string, extra: { shopGrupo: e.shopGrupo, precioExtra: e.precioExtra } }));
    const datos = await lineaDeCombinacion(prisma, T, { id: c.id, modeloId: modelo.id, variantes: ids }, opciones, "correccion");
    console.log(`${l.pedido}: → ${c.nombre}, costo ${datos.costoUnitario}`);
    if (real) await prisma.itemPedido.update({ where: { id: item.id }, data: datos });
  }
}

async function main() {
  const [fase, ...resto] = process.argv.slice(2);
  const real = resto.includes("--real");
  if (fase === "preparar") return preparar(real);
  if (fase === "lineas") return lineas(real);
  if (fase === "mapear") {
    const archivo = resto.find((a) => !a.startsWith("--"));
    if (!archivo) throw new Error("falta el catálogo exportado (JSON)");
    return mapear(archivo, real);
  }
  throw new Error("uso: preparar [--real] | mapear <catalogo.json> [--real] | lineas [--real]");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
