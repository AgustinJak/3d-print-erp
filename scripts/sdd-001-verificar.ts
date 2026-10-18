/**
 * docs/sdd/001 — modo sombra y backfill desde la terminal.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-verificar.ts [verificar|simular-backfill|backfill]
 *
 * Las mismas funciones que exponen /api/combinaciones/verificar y /backfill, sin
 * pasar por la sesión. `verificar` y `simular-backfill` sólo leen.
 */
import { prisma } from "@/lib/prisma";
import { verificarReparto } from "@/lib/reservas";
import { completarCombinacionesDeLineas } from "@/lib/combinaciones";

const TENANT = "sendero3d";
const accion = process.argv[2] ?? "verificar";

async function main() {
  if (accion === "verificar") {
    const r = await verificarReparto(TENANT);
    console.log(
      `Pedidos abiertos: ${r.pedidos} · líneas: ${r.lineas} · iguales: ${r.iguales} · distintas: ${r.distintas.length} · sin combinación: ${r.sinCombinacion.length} · sin modelo: ${r.sinModelo}`
    );
    for (const d of r.distintas) console.log("  DISTINTA", d.pedido ?? d.pedidoId, d.itemId, "\n    json:", d.json, "\n    comb:", d.combinacion);
    for (const s of r.sinCombinacion) console.log("  SIN COMBINACIÓN", s.pedido ?? s.pedidoId, s.clave);
  } else if (accion === "simular-backfill" || accion === "backfill") {
    const r = await completarCombinacionesDeLineas(prisma, TENANT, { simular: accion === "simular-backfill" });
    console.log(accion, JSON.stringify({ ...r, problemas: r.problemas.length }, null, 1));
    for (const p of r.problemas.slice(0, 10)) console.log("  PROBLEMA", p.itemId, p.motivo);
  } else {
    throw new Error(`acción desconocida: ${accion}`);
  }
}

main().finally(() => prisma.$disconnect());
