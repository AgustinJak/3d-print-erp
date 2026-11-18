/**
 * Los costos de fabricación editados desde el ERP (2026-11-18), contra la base.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/probar-costos-de-fabricacion.ts
 *
 * No cambia ningún costo: lo que escribe es un material de prueba al mismo precio que el por
 * defecto, que se marca por defecto, se devuelve la marca al original y se borra.
 */
import { prisma } from "@/lib/prisma";
import { guardarMaterial, guardarTaller, leerCostosDeFabricacion } from "@/lib/costos-de-fabricacion";
import { validarTaller } from "@/lib/costos-taller";

let ok = 0;
let mal = 0;
function ver(nombre: string, cond: boolean, detalle = "") {
  if (cond) ok++;
  else mal++;
  console.log(`${cond ? "✓" : "✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

async function main() {
  const antes = await leerCostosDeFabricacion();
  const defecto = antes.materiales.find((m) => m.porDefecto)!;
  console.log("parámetros:", antes.parametros, "· por defecto:", defecto.nombre, defecto.precioKg);
  ver("hay un solo por defecto", antes.materiales.filter((m) => m.porDefecto).length === 1);
  ver("el precio del kilo general sigue al por defecto", antes.parametros.precioKg === defecto.precioKg, `${antes.parametros.precioKg} / ${defecto.precioKg}`);

  // Validaciones: no escriben.
  ver("taller: margen de 150 % rechazado", "error" in validarTaller({ margenError: 150 }));
  ver("taller: consumo 0 rechazado", "error" in validarTaller({ consumoW: 0 }));
  ver("taller: \"220,5\" se lee 220,5", (validarTaller({ precioKwh: "220,5" }) as { cambios: { precioKwh: number } }).cambios.precioKwh === 220.5);
  ver("taller: sin cambios no guarda", "error" in (await guardarTaller("sendero3d", {})));
  ver("otro negocio no puede", "error" in (await guardarTaller("otro", { margenError: 10 })));
  ver("material sin precio rechazado", "error" in (await guardarMaterial("sendero3d", { nombre: "X", precioKg: 0 })));
  ver("material con nombre repetido rechazado", "error" in (await guardarMaterial("sendero3d", { nombre: defecto.nombre.toUpperCase(), precioKg: 1000 })));
  ver("al por defecto no se le saca la marca", "error" in (await guardarMaterial("sendero3d", { id: defecto.id, porDefecto: false })));
  ver("el por defecto no se desactiva", "error" in (await guardarMaterial("sendero3d", { id: defecto.id, activo: false })));

  // Escritura, sin mover ningún costo.
  const NOMBRE = "Prueba costos ERP (borrar)";
  try {
    const r1 = await guardarMaterial("sendero3d", { nombre: NOMBRE, precioKg: defecto.precioKg });
    ver("crea un material", "ok" in r1, JSON.stringify(r1));
    const [prueba] = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM bodega.materials WHERE nombre = ${NOMBRE}`;
    const r2 = await guardarMaterial("sendero3d", { id: prueba.id, porDefecto: true });
    ver("lo marca por defecto", "ok" in r2, JSON.stringify(r2));
    const medio = await leerCostosDeFabricacion();
    ver("pasa la marca: uno solo, el nuevo", medio.materiales.filter((m) => m.porDefecto).map((m) => m.id).join() === prueba.id);
    ver("ningún producto cambió de costo", "ok" in r2 && r2.modelos === 0, `${"ok" in r2 ? r2.modelos : "?"}`);
    const r3 = await guardarMaterial("sendero3d", { id: defecto.id, porDefecto: true });
    ver("devuelve la marca al original", "ok" in r3);
  } finally {
    await prisma.$executeRaw`UPDATE bodega.materials SET por_defecto = false WHERE nombre = ${NOMBRE}`;
    const [d] = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) n FROM bodega.materials WHERE por_defecto`;
    if (Number(d.n) === 0) await prisma.$executeRaw`UPDATE bodega.materials SET por_defecto = true WHERE id = ${defecto.id}`;
    await prisma.$executeRaw`DELETE FROM bodega.materials WHERE nombre = ${NOMBRE} AND NOT EXISTS (SELECT 1 FROM bodega.models WHERE material_id = bodega.materials.id)`;
  }
  const despues = await leerCostosDeFabricacion();
  ver("quedó como estaba", JSON.stringify(despues.materiales) === JSON.stringify(antes.materiales) && JSON.stringify(despues.parametros) === JSON.stringify(antes.parametros));

  console.log(`\n${ok} de ${ok + mal}`);
  process.exitCode = mal ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
