/**
 * docs/sdd/018 — la hoja del día de punta a punta contra la base y ML, y se borra al final.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-018-probar-hoja.ts
 *
 * Crea la hoja de HOY con un envío real, lo marca como lo haría el repartidor, mira la semana y borra
 * la hoja. No muestra direcciones ni nombres: sólo si vinieron.
 */
import { prisma } from "@/lib/prisma";
import { armarDia, hojaDelRepartidor, mandarHoja, marcarDesdeLink, semanas } from "@/lib/reparto";
import { hoyEnArgentina } from "@/lib/temas";

let ok = 0;
let mal = 0;
const ver = (n: string, c: boolean, d = "") => (c ? ok++ : mal++, console.log(`${c ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`));

async function main() {
  const dia = hoyEnArgentina();
  const ya = await prisma.hojaReparto.findUnique({ where: { tenantId_dia: { tenantId: "sendero3d", dia: new Date(`${dia}T00:00:00Z`) } } });
  if (ya) {
    console.log("Ya hay una hoja de hoy (de Agustín): no se prueba para no pisarla.");
    return;
  }
  const d = await armarDia();
  console.log(`candidatos ${d.candidatos.length}: ${d.candidatos.map((c) => `${c.origen} ${c.zona?.nombre ?? "sin zona"}${c.ingreso ? ` (entra ${c.ingreso})` : ""}`).join(" · ")}`);
  ver("hay zonas", d.zonas.length === 4);
  const c = d.candidatos.find((x) => x.zona) ?? d.candidatos[0];
  if (!c) {
    console.log("No hay envíos hoy para probar la hoja.");
    return;
  }
  try {
    const r = await mandarHoja([{ pedidoId: c.pedidoId, origen: c.origen, envioMl: c.envioMl, zonaId: c.zona?.id ?? null }]);
    ver("se crea la hoja", "ok" in r);
    if (!("ok" in r)) return;
    ver("token largo y al azar", r.token.length >= 40);

    const h = await hojaDelRepartidor(r.token);
    ver("el link abre la hoja", !!h && h.envios.length === 1);
    const e = h!.envios[0];
    ver("trae dirección", !!e.direccion);
    ver("trae botón a Google Maps", !!e.mapa?.startsWith("https://www.google.com/maps/"));
    ver("trae lo que lleva", e.productos.length > 0);
    ver("trae la zona y el precio", !!e.zona && e.precio != null, `${e.zona} ${e.precio}`);
    ver("un token inventado no abre nada", (await hojaDelRepartidor("x".repeat(43))) === null);

    ver("marca Lo llevo", "ok" in (await marcarDesdeLink(r.token, e.id, { estado: "tomado" })));
    ver("marca Entregado", "ok" in (await marcarDesdeLink(r.token, e.id, { estado: "entregado" })));
    ver("un estado inventado no", "error" in (await marcarDesdeLink(r.token, e.id, { estado: "pagado" })));
    const otro = await marcarDesdeLink("y".repeat(43), e.id, { estado: "rechazado" });
    ver("otro token no puede marcarlo", "error" in otro && otro.status === 410);

    const h2 = await hojaDelRepartidor(r.token);
    ver("la semana del repartidor suma el entregado", (h2?.semana.entregados ?? 0) >= 1 && (h2?.semana.total ?? 0) >= (e.precio ?? 0));
    const s = (await semanas(1))[0];
    ver("la semana lo cuenta", !!s && s.entregados >= 1 && s.total >= (e.precio ?? 0), s ? `${s.entregados} entregados, $${s.total}` : "");

    // Un link vencido no abre.
    await prisma.hojaReparto.update({ where: { tokenHash: undefined, id: (await prisma.envioReparto.findUnique({ where: { id: e.id } }))!.hojaId }, data: { vence: new Date(Date.now() - 1000) } });
    ver("el link vencido no abre", (await hojaDelRepartidor(r.token)) === null);
  } finally {
    const del = await prisma.hojaReparto.deleteMany({ where: { tenantId: "sendero3d", dia: new Date(`${dia}T00:00:00Z`) } });
    console.log(`\nhoja de prueba borrada (${del.count})`);
  }
  console.log(`${ok} de ${ok + mal}`);
  process.exitCode = mal ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
