/**
 * docs/sdd/018 — la hoja de punta a punta contra la base y ML, y se borra al final.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-018-probar-hoja.ts
 *
 * Busca el primer día de los próximos 7 con envíos y sin hoja mandada, arma esa hoja con un envío
 * real, lo marca como lo haría el repartidor, mira la semana y borra la hoja. No muestra direcciones
 * ni nombres: sólo si vinieron.
 */
import { prisma } from "@/lib/prisma";
import { armarDia, hojaDelRepartidor, mandarHoja, marcarDesdeLink, semanas } from "@/lib/reparto";

let ok = 0;
let mal = 0;
const ver = (n: string, c: boolean, d = "") => (c ? ok++ : mal++, console.log(`${c ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`));
const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const masUno = (dia: string) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10);

async function main() {
  const hoy = await armarDia();
  ver("trae los próximos 7 días", hoy.proximos.length === 7 && hoy.proximos[0].dia === hoy.dia, hoy.proximos.map((p) => `${p.dia.slice(5)}: ${p.flex}F ${p.web}W`).join(" · "));
  ver("hay zonas", hoy.zonas.length === 4);
  ver("no se puede mandar un día que pasó", "error" in (await mandarHoja("2026-01-01", [{ pedidoId: "x", origen: "web" }])));

  const dia = hoy.proximos.find((p) => p.flex + p.web > 0 && !p.hoja)?.dia;
  if (!dia) return console.log("No hay días con envíos y sin hoja en la semana: no se prueba la hoja.");
  const d = await armarDia(dia);
  ver(`se arma el día ${dia}`, d.dia === dia && d.candidatos.length > 0, d.candidatos.map((c) => `${c.origen} ${c.zona?.nombre ?? "sin zona"} ${c.estadoPedido ?? ""}${c.etiqueta ? `/${c.etiqueta}` : ""}`).join(" · "));
  const c = d.candidatos.find((x) => x.zona) ?? d.candidatos[0];
  try {
    const r = await mandarHoja(dia, [{ pedidoId: c.pedidoId, origen: c.origen, envioMl: c.envioMl, zonaId: c.zona?.id ?? null }]);
    ver("se crea la hoja", "ok" in r);
    if (!("ok" in r)) return;
    ver("el link vale hasta el final del día siguiente", r.vence.slice(0, 10) >= masUno(dia), r.vence);
    const h = await hojaDelRepartidor(r.token);
    ver("el link abre la hoja", !!h && h.envios.length === 1 && h.dia === dia);
    const e = h!.envios[0];
    ver("trae dirección y Maps", !!e.direccion && !!e.mapa);
    ver("trae zona y precio, y no el producto", !!e.zona && e.precio != null && !("productos" in e), `${e.zona} ${e.precio}`);
    ver("un token inventado no abre nada", (await hojaDelRepartidor("x".repeat(43))) === null);
    ver("marca Lo llevo", "ok" in (await marcarDesdeLink(r.token, e.id, { estado: "tomado" })));
    ver("marca Entregado", "ok" in (await marcarDesdeLink(r.token, e.id, { estado: "entregado" })));
    ver("un estado inventado no", "error" in (await marcarDesdeLink(r.token, e.id, { estado: "pagado" })));
    const otro = await marcarDesdeLink("y".repeat(43), e.id, { estado: "rechazado" });
    ver("otro token no puede marcarlo", "error" in otro && otro.status === 410);
    const h2 = await hojaDelRepartidor(r.token);
    ver("la semana del repartidor suma el entregado", (h2?.semana.entregados ?? 0) >= 1);
    const s = (await semanas(2)).find((w) => w.desde <= dia && w.hasta >= dia);
    ver("la semana lo cuenta", !!s && s.entregados >= 1, s ? `${s.entregados} entregados, $${s.total}` : "");
    await prisma.hojaReparto.update({ where: { tenantId_dia: { tenantId: "sendero3d", dia: fecha(dia) } }, data: { vence: new Date(Date.now() - 1000) } });
    ver("el link vencido no abre", (await hojaDelRepartidor(r.token)) === null);
  } finally {
    const del = await prisma.hojaReparto.deleteMany({ where: { tenantId: "sendero3d", dia: fecha(dia) } });
    console.log(`\nhoja de prueba borrada (${del.count})`);
  }
  console.log(`${ok} de ${ok + mal}`);
  process.exitCode = mal ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
