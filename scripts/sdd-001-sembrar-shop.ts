/**
 * Siembra del mapeo del Shop desde su catálogo (docs/sdd/001, spec 004, REQ-7; TASK-013).
 *
 *   npx tsx --env-file=.env scripts/sdd-001-sembrar-shop.ts <catalogo.json> [--real]
 *
 * El ERP no tiene credenciales de la base del Shop: el catálogo se exporta con SQL
 * de sólo lectura (productos activos, con sus grupos y opciones activas e ids) y se
 * le pasa a este script. Por cada producto, una clave por cada combinación de sus
 * opciones (`<producto_id>|<opcion_ids>`), resuelta con la misma lógica que el
 * webhook. Por defecto simula; con --real escribe mapeos_canal.
 *
 * Un grupo "Pack" o "Cantidad" no es una variante: da las unidades de la clave
 * ("10 unidades ($2250u)" = 10) y se deja afuera al deducir (spec 004, RN-8).
 */
import fs from "node:fs";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { claveDe } from "@/lib/combinaciones";
import { claveShop, describirVenta, esAmbigua, resolverLinea } from "@/lib/mapeo-canal";
import { deducirLineaShop } from "@/lib/mapeo-shop";

const T = "sendero3d";

interface Opcion {
  id: string;
  valor: string;
}
interface Grupo {
  id: string;
  nombre: string;
  opciones: Opcion[];
}
interface Producto {
  id: string;
  sku: string | null;
  nombre: string;
  grupos: Grupo[];
}
type Elegida = { grupoId: string; grupo: string; opcionId: string; nombre: string };

const ES_PACK = /^\s*(pack|cantidad)\s*$/i;

/** Todas las combinaciones de una opción por grupo. */
function combinaciones(grupos: Grupo[]): Elegida[][] {
  let out: Elegida[][] = [[]];
  for (const g of grupos) {
    out = out.flatMap((pre) =>
      g.opciones.map((o) => [...pre, { grupoId: g.id, grupo: g.nombre, opcionId: o.id, nombre: o.valor }])
    );
  }
  return out;
}

function unidadesDe(elegidas: Elegida[]): number {
  for (const e of elegidas) {
    if (!ES_PACK.test(e.grupo)) continue;
    const n = Number(/(\d+)\s*unidad/i.exec(e.nombre)?.[1]);
    if (Number.isInteger(n) && n >= 1) return n;
  }
  return 1;
}

async function main() {
  const args = process.argv.slice(2);
  const archivo = args.find((a) => !a.startsWith("--"));
  if (!archivo) throw new Error("falta el catálogo exportado (JSON)");
  const real = args.includes("--real");
  const catalogo: Producto[] = JSON.parse(fs.readFileSync(archivo, "utf8"));

  const filas: Array<{ producto: string; clave: string; opciones: string; unidades: number; resultado: string }> = [];
  for (const p of catalogo) {
    const grupos = p.grupos.filter((g) => g.opciones.length > 0);
    for (const elegidas of combinaciones(grupos)) {
      const clave = claveShop({
        productoId: p.id,
        sku: p.sku,
        nombre: p.nombre,
        opciones: elegidas.map((e) => ({ opcionId: e.opcionId, nombre: e.nombre })),
      });
      const unidades = unidadesDe(elegidas);
      const paraDeducir = elegidas.filter((e) => !ES_PACK.test(e.grupo));
      const d = await deducirLineaShop(prisma, T, {
        sku: p.sku,
        nombre_producto: p.nombre.trim(),
        opciones_seleccionadas: paraDeducir.map((e) => ({ grupo: e.grupo, nombre: e.nombre, precio_extra: 0 })),
      });
      const sugerencia = d.modelo ? { modeloId: d.modelo.id, variantes: d.variantes, sinDudas: d.avisos.length === 0 } : null;
      const opciones = elegidas.map((e) => `${e.grupo}: ${e.nombre}`).join(" · ");

      let resultado: string;
      if (!real) {
        const existente = await prisma.mapeoCanal.findUnique({
          where: { tenantId_canal_clave: { tenantId: T, canal: "shop", clave } },
          include: { combinacion: { select: { nombre: true } } },
        });
        if (existente) resultado = existente.combinacion ? `ya mapeada → ${existente.combinacion.nombre}` : "ya en la cola";
        else if (!sugerencia) resultado = "cola: sin modelo en el ERP (ni por SKU ni por nombre)";
        else if (!sugerencia.sinDudas) resultado = `cola: ${d.avisos.join("; ")}`;
        else if (await esAmbigua(prisma, T, sugerencia.modeloId, sugerencia.variantes)) resultado = `cola: "${d.modelo!.nombre}" solo, sin decir cuál variante`;
        else {
          const c = await prisma.combinacion.findUnique({
            where: { tenantId_clave: { tenantId: T, clave: claveDe(sugerencia.modeloId, sugerencia.variantes) } },
            select: { nombre: true, activo: true },
          });
          resultado = c ? (c.activo ? `→ ${c.nombre}` : `cola: ${c.nombre} está desactivada`) : `→ combinación nueva de "${d.modelo!.nombre}"`;
        }
      } else {
        const r = await resolverLinea(prisma, T, "shop", clave, {
          sugerencia,
          descripcion: describirVenta(p.nombre, elegidas.map((e) => ({ grupo: e.grupo, nombre: e.nombre }))),
          muestra: {
            producto_id: p.id,
            sku: p.sku,
            nombre_producto: p.nombre,
            opciones: elegidas.map((e) => ({ grupo_id: e.grupoId, grupo: e.grupo, opcion_id: e.opcionId, nombre: e.nombre })),
          } as Prisma.InputJsonValue,
          contar: false,
          origen: "siembra",
        });
        if (unidades > 1) {
          await prisma.mapeoCanal.updateMany({ where: { id: r.mapeoId, origen: { not: "manual" } }, data: { unidades } });
        }
        resultado = r.tipo === "combinacion" ? `→ ${r.combinacion.nombre}` : r.tipo;
      }
      filas.push({ producto: p.nombre.trim(), clave, opciones, unidades, resultado });
    }
  }

  const mapeadas = filas.filter((f) => f.resultado.startsWith("→") || f.resultado.startsWith("ya mapeada"));
  console.log(`${real ? "SIEMBRA" : "SIMULACIÓN"}: ${catalogo.length} productos, ${filas.length} claves, ${mapeadas.length} resueltas, ${filas.length - mapeadas.length} a la cola\n`);
  let actual = "";
  for (const f of filas) {
    if (f.producto !== actual) {
      actual = f.producto;
      console.log(`\n${actual}`);
    }
    console.log(`   ${f.opciones || "(sin opciones)"}${f.unidades > 1 ? ` [×${f.unidades}]` : ""}  ${f.resultado}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
