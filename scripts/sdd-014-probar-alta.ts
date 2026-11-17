/**
 * docs/sdd/014, spec 002 — pruebas del alta de un producto.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-014-probar-alta.ts [--base <archivoId>]
 *
 * Primero la validación (pura). Con `--base <id de un archivo de la biblioteca con varias placas>`
 * además crea en la base real un producto de prueba ("PRUEBA SDD 014 …") con variantes por placa y
 * una funda nueva, mira que quede todo enganchado y lo borra entero al final.
 */
import { prisma } from "@/lib/prisma";
import { validarAlta, type EntradaAlta } from "@/lib/alta-producto-reglas";
import { crearProductoCompleto } from "@/lib/alta-producto";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

const RECETA = { gramos: 100, segundos: 3600, materialId: null, insumos: null };
const base: EntradaAlta = { nombre: "Porta auricular Nube", serie: null, fabrica: true, receta: RECETA, modelo: null, variantes: null, funda: null };

ok(validarAlta(base) === null, "un producto simple está bien");
ok(validarAlta({ ...base, nombre: "  " }) === "Falta el nombre", "sin nombre no");
ok(!!validarAlta({ ...base, nombre: "Bola · Rojo" }), 'el nombre no puede tener "·"');
ok(!!validarAlta({ ...base, receta: { ...RECETA, gramos: -5 } }), "gramos negativos no");
ok(validarAlta({ ...base, fabrica: false, receta: { gramos: null, segundos: null, materialId: null, insumos: null } }) === null, "un kit sin receta está bien");
ok(!!validarAlta({ ...base, variantes: { grupo: "Color", opciones: [] } }), "un grupo sin opciones no");
ok(
  validarAlta({ ...base, variantes: { grupo: "Color", opciones: [{ nombre: "Rojo", modelo: null }, { nombre: " rojo ", modelo: null }] } }) === "La opción \"rojo\" está repetida",
  "opciones repetidas (sin importar mayúsculas ni espacios) no"
);
ok(!!validarAlta({ ...base, variantes: { grupo: "Color", opciones: [{ nombre: "Rojo", modelo: { archivoId: "x", placa: 0 } }] } }), "la placa 0 no existe");
ok(!!validarAlta({ ...base, funda: { grupo: "Funda", insumoStockId: null, nuevo: null } }), "la funda tiene que descontar algo");
ok(!!validarAlta({ ...base, funda: { grupo: "Funda", insumoStockId: "s", nuevo: { nombre: "F", modelo: null, receta: RECETA } } }), "o una existente o una nueva, no las dos");
ok(!!validarAlta({ ...base, variantes: { grupo: "Funda", opciones: [{ nombre: "A", modelo: null }] }, funda: { grupo: "funda", insumoStockId: "s", nuevo: null } }), "la funda y las variantes no se llaman igual");

async function deBase(archivoId: string) {
  const sello = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  const nombre = `PRUEBA SDD 014 ${sello}`;
  const entrada: EntradaAlta = {
    nombre,
    serie: "Pruebas",
    fabrica: true,
    receta: { gramos: 50, segundos: 1800, materialId: null, insumos: 100 },
    modelo: null,
    variantes: {
      grupo: "Diseño",
      opciones: [
        { nombre: "Uno", modelo: { archivoId, placa: 1 } },
        { nombre: "Dos", modelo: { archivoId, placa: 2 }, receta: { gramos: 80 } },
        { nombre: "Tres", modelo: { archivoId, placa: null } },
      ],
    },
    funda: { grupo: "Funda", insumoStockId: null, nuevo: { nombre: `Funda ${nombre}`, modelo: { archivoId, placa: 3 }, receta: { gramos: 30, segundos: 900, materialId: null, insumos: null } } },
  };

  const r = await crearProductoCompleto("sendero3d", entrada);
  ok(r.piezas === 4, "crea 4 piezas: 3 diseños y la funda", r);

  try {
    const filas = await prisma.stock.findMany({ where: { modeloId: r.modeloId }, select: { id: true, etiqueta: true, bodegaModelId: true } });
    ok(filas.length === 3 && filas.every((f) => f.bodegaModelId), "3 filas de stock, todas con su pieza", filas);
    const piezas = await prisma.$queryRaw<Array<{ id: string; name: string; filament_grams: number | null; insumos: string | null }>>`
      SELECT id, name, filament_grams, insumos::text FROM bodega.models WHERE id = ANY(${filas.map((f) => f.bodegaModelId!)})`;
    ok(piezas.some((p) => p.name === `${nombre} · Dos` && p.filament_grams === 80), "la pieza de \"Dos\" tiene sus 80 g", piezas);
    ok(piezas.some((p) => p.name === `${nombre} · Uno` && p.filament_grams === 50 && Number(p.insumos) === 100), "\"Uno\" hereda los gramos y los insumos del producto", piezas);
    const enganches = await prisma.piezaArchivo.findMany({ where: { bodegaModelId: { in: filas.map((f) => f.bodegaModelId!) } } });
    ok(enganches.length === 3 && enganches.every((e) => e.archivoId === archivoId), "las 3 comparten el mismo archivo");
    ok(enganches.map((e) => e.placa).sort().join(",") === "1,2,", "cada una con su placa (y \"Tres\" con el archivo entero)", enganches.map((e) => e.placa));
    const combinaciones = await prisma.combinacion.findMany({ where: { modeloId: r.modeloId, activo: true }, select: { nombre: true } });
    // Las de dos grupos ("Uno · Con Funda") se crean cuando hacen falta, no se siembran (SDD 004, spec 003, RN-3).
    ok(combinaciones.length === 5, "una combinación por diseño y \"Con\" y \"Sin Funda\"", combinaciones.map((c) => c.nombre));
    const reglas = await prisma.reglaInsumo.findMany({ where: { modeloId: r.modeloId }, include: { stock: { select: { etiqueta: true, bodegaModelId: true } } } });
    ok(reglas.length === 1 && reglas[0].stock.etiqueta === `Funda ${nombre}` && !!reglas[0].stock.bodegaModelId, "\"Con Funda\" descuenta la funda nueva, que tiene su pieza", reglas);
    const insumo = await prisma.modelo.findUnique({ where: { id: r.insumoNuevoId! }, select: { esInsumo: true, activo: true } });
    ok(!!insumo?.esInsumo && insumo.activo === false, "la funda nueva es un insumo, no un producto a la venta", insumo);

    // El nombre repetido no se crea dos veces.
    let repetido = "";
    await crearProductoCompleto("sendero3d", { ...entrada, funda: null }).catch((e) => (repetido = String(e.message)));
    ok(repetido.includes("ya hay un producto"), "no deja crear otro con el mismo nombre", repetido);

    // Si algo falla a mitad, no queda nada: una placa que el archivo no tiene.
    const nombreMal = `${nombre} MAL`;
    let fallo = "";
    await crearProductoCompleto("sendero3d", { ...entrada, nombre: nombreMal, funda: null, variantes: { grupo: "Diseño", opciones: [{ nombre: "Uno", modelo: { archivoId, placa: 999 } }] } }).catch(
      (e) => (fallo = String(e.message))
    );
    const quedo = await prisma.modelo.findFirst({ where: { nombre: nombreMal } });
    const piezasMal = await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM bodega.models WHERE name LIKE ${nombreMal + "%"}`;
    ok(fallo.includes("placa 999") && !quedo && piezasMal[0].n === 0, "si falla a mitad no queda ni el producto ni las piezas", { fallo, quedo: !!quedo, piezas: piezasMal[0].n });
  } finally {
    // Borra todo lo de la prueba.
    const modelos = await prisma.modelo.findMany({ where: { nombre: { contains: nombre } }, select: { id: true } });
    const ids = modelos.map((m) => m.id);
    const piezas = (await prisma.stock.findMany({ where: { modeloId: { in: ids } }, select: { bodegaModelId: true } })).map((f) => f.bodegaModelId).filter((x): x is string => !!x);
    await prisma.piezaArchivo.deleteMany({ where: { bodegaModelId: { in: piezas } } });
    await prisma.$executeRaw`DELETE FROM bodega.models WHERE id = ANY(${piezas})`;
    await prisma.reglaInsumo.deleteMany({ where: { modeloId: { in: ids } } });
    await prisma.combinacion.deleteMany({ where: { modeloId: { in: ids } } });
    await prisma.modelo.deleteMany({ where: { id: { in: ids } } });
    const resto = await prisma.modelo.count({ where: { nombre: { contains: "PRUEBA SDD 014" } } });
    ok(resto === 0, "la prueba se borró entera");
  }
}

async function main() {
  const i = process.argv.indexOf("--base");
  if (i >= 0) await deBase(process.argv[i + 1]);
  console.log(`\n${pruebas - fallas} de ${pruebas} bien`);
}
main()
  .catch((e) => {
    console.error(e);
    fallas++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(fallas ? 1 : 0);
  });
