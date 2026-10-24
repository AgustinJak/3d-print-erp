/**
 * Relleno del grupo y el tipo de cada variante, y de la marca de insumo (docs/sdd/004, TASK-002).
 *
 *   npx tsx --env-file=.env scripts/sdd-004-rellenar-grupos.ts [--real] [--detalle]
 *
 * Por defecto simula y muestra cómo quedaría cada producto. Con --real escribe, sólo donde
 * `tipo` está vacío (no pisa lo que ya se clasificó a mano), y después aplica la parte 2 de
 * prisma/sql/catalogo-grupos-e-insumos.sql si todas las variantes quedaron con tipo.
 *
 * Reglas (sdd-tecnico.md §2):
 *   - tipo: pieza si afecta_stock; insumo si es "Con X"/"Sin X" o una "Funda" suelta (los modelos
 *     viejos tenían una variante "Funda" sola); si no, decoración.
 *   - grupo: X para los pares Con/Sin y "Funda" para la suelta; "Tamaño" para "65cm"…; para el
 *     resto, el de la tabla GRUPO_POR_PRODUCTO, o "Variante".
 *   - es_insumo: los modelos cuyo stock usa alguna receta, y los de la categoría Insumos.
 */
import { prisma } from "@/lib/prisma";

const CON_SIN = /^(con|sin)\s+(.+)$/i;
const TAMANO = /^\s*\d{2,3}\s*cm\s*$/i;

/** El nombre del grupo cuando no sale del nombre de la opción. */
const GRUPO_POR_PRODUCTO: Record<string, string> = {
  "Bola de JOJOS": "Color",
  "Porta auricular NUBE": "Color",
  Sauce: "Color",
  "Jabonera minimalista": "Diseño",
  "Llavero BT21": "Personaje",
  "Vaso Bts": "Firma",
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function clasificar(
  v: { nombre: string; afectaStock: boolean },
  producto: string
): { tipo: "pieza" | "insumo" | "decoracion"; grupo: string } {
  const conSin = CON_SIN.exec(v.nombre.trim());
  const tipo = v.afectaStock ? "pieza" : conSin || /^funda$/i.test(v.nombre.trim()) ? "insumo" : "decoracion";
  let grupo: string;
  if (conSin && !v.afectaStock) grupo = capital(conSin[2].trim());
  else if (/^funda$/i.test(v.nombre.trim())) grupo = "Funda";
  else if (TAMANO.test(v.nombre)) grupo = "Tamaño";
  else grupo = GRUPO_POR_PRODUCTO[producto] ?? (v.afectaStock ? "Color" : "Variante");
  return { tipo, grupo };
}

async function main() {
  const real = process.argv.includes("--real");
  const detalle = process.argv.includes("--detalle");

  const variantes = await prisma.varianteModelo.findMany({
    select: { id: true, nombre: true, afectaStock: true, tipo: true, grupo: true, modelo: { select: { nombre: true, activo: true, consolidadoEnId: true, tenantId: true } } },
    orderBy: [{ modelo: { nombre: "asc" } }, { nombre: "asc" }],
  });

  type Fila = { id: string; producto: string; nombre: string; tipo: string; grupo: string; vigente: boolean };
  const filas: Fila[] = variantes
    .filter((v) => !v.tipo)
    .map((v) => ({
      id: v.id,
      producto: v.modelo.nombre,
      nombre: v.nombre,
      ...clasificar(v, v.modelo.nombre),
      vigente: v.modelo.activo && !v.modelo.consolidadoEnId,
    }));

  // Resumen por producto vigente, y por clase en el historial.
  const porProducto = new Map<string, Fila[]>();
  for (const f of filas.filter((x) => x.vigente)) porProducto.set(f.producto, [...(porProducto.get(f.producto) ?? []), f]);
  console.log(`${real ? "RELLENO" : "SIMULACIÓN"}: ${filas.length} variantes sin tipo (${variantes.length - filas.length} ya tenían)\n`);
  console.log("— Productos vigentes —");
  for (const [p, fs] of porProducto) {
    const grupos = new Map<string, Fila[]>();
    for (const f of fs) grupos.set(`${f.grupo} (${f.tipo})`, [...(grupos.get(`${f.grupo} (${f.tipo})`) ?? []), f]);
    const texto = [...grupos].map(([g, xs]) => `${g}: ${xs.map((x) => x.nombre).join(", ")}`).join(" | ");
    if (detalle || !/^Funda \(insumo\): (Con|Sin) Funda, (Con|Sin) Funda$/.test(texto)) console.log(`  ${p} → ${texto}`);
  }
  const katanas = [...porProducto.values()].filter((fs) => fs.every((f) => f.grupo === "Funda" && f.tipo === "insumo")).length;
  console.log(`  (+ ${katanas} productos con sólo "Funda (insumo): Con Funda, Sin Funda")`);

  const historia = filas.filter((x) => !x.vigente);
  const clases = new Map<string, number>();
  for (const f of historia) clases.set(`${f.grupo} (${f.tipo})`, (clases.get(`${f.grupo} (${f.tipo})`) ?? 0) + 1);
  console.log(`\n— Historial (productos inactivos o consolidados): ${historia.length} —`);
  for (const [c, n] of clases) console.log(`  ${c}: ${n}`);

  const insumos = await prisma.$queryRaw<Array<{ id: string; nombre: string; es_insumo: boolean }>>`
    SELECT DISTINCT m.id, m.nombre, m.es_insumo
      FROM public.modelos m
      LEFT JOIN public.categorias_modelos cm ON cm.modelo_id = m.id
      LEFT JOIN public.categorias c ON c.id = cm.categoria_id
     WHERE EXISTS (SELECT 1 FROM public.reglas_insumo r JOIN public.stock s ON s.id = r.stock_id WHERE s.modelo_id = m.id)
        OR c.nombre ILIKE 'insumos'
     ORDER BY m.nombre`;
  const nuevosInsumos = insumos.filter((i) => !i.es_insumo);
  console.log(`\n— Pasan a insumo: ${nuevosInsumos.length} —`);
  for (const i of nuevosInsumos) console.log(`  ${i.nombre}`);

  if (!real) return;

  await prisma.$transaction(
    async (tx) => {
      for (const f of filas) {
        await tx.varianteModelo.updateMany({ where: { id: f.id, tipo: null }, data: { tipo: f.tipo, grupo: f.grupo } });
      }
      if (nuevosInsumos.length) {
        await tx.modelo.updateMany({ where: { id: { in: nuevosInsumos.map((i) => i.id) } }, data: { esInsumo: true } });
      }
    },
    { timeout: 120_000, maxWait: 10_000 }
  );

  const sinTipo = await prisma.varianteModelo.count({ where: { tipo: null } });
  if (sinTipo > 0) {
    console.log(`\n!! Quedan ${sinTipo} variantes sin tipo: no se aplica la parte 2.`);
    return;
  }
  await prisma.$executeRawUnsafe(`alter table public.variantes_modelo alter column tipo set not null`);
  await prisma.$executeRawUnsafe(`alter table public.variantes_modelo drop constraint if exists variantes_modelo_tipo_y_stock`);
  await prisma.$executeRawUnsafe(
    `alter table public.variantes_modelo add constraint variantes_modelo_tipo_y_stock check ((tipo = 'pieza') = afecta_stock)`
  );
  console.log("\nParte 2 aplicada: tipo obligatorio y atado a afecta_stock.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
