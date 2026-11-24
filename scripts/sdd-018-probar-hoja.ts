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
import { armarDia, armarReparto, hojaDelRepartidor, mandarHoja, marcarDesdeLink, semanas } from "@/lib/reparto";

let ok = 0;
let mal = 0;
const ver = (n: string, c: boolean, d = "") => (c ? ok++ : mal++, console.log(`${c ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`));
const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const masUno = (dia: string) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10);

async function main() {
  let t = Date.now();
  const semana = await armarReparto();
  ver("la semana entera de una vez", semana.dias.length === 7 && semana.dias[0].dia === semana.hoy, `${Date.now() - t} ms`);
  ver("cada día trae lo que dice su ficha", semana.dias.every((x, i) => x.candidatos.filter((c) => c.etiqueta !== null || c.estadoPedido !== null).length === semana.proximos[i].flex + semana.proximos[i].web));
  t = Date.now();
  const hoy = await armarDia();
  ver("trae los próximos 7 días", hoy.proximos.length === 7 && hoy.proximos[0].dia === hoy.dia, hoy.proximos.map((p) => `${p.dia.slice(5)}: ${p.flex}F ${p.web}W`).join(" · "));
  ver("hay zonas", hoy.zonas.length === 4);
  ver("no se puede mandar un día que pasó", "error" in (await mandarHoja("2026-01-01", [{ pedidoId: "x", origen: "web" }])));

  // La prueba usa un día sin hoja (aunque no tenga envíos) con un envío real de la semana, para no
  // tocar las hojas que ya se mandaron.
  const dia = [...hoy.proximos].reverse().find((p) => !p.hoja && !semana.dias.find((x) => x.dia === p.dia)?.hoja)?.dia;
  const todos = semana.dias.flatMap((x) => x.candidatos).filter((x) => x.etiqueta !== null || x.estadoPedido !== null);
  const c = todos.find((x) => x.zona) ?? todos[0];
  if (!dia || !c) return console.log("No hay un día sin hoja o no hay envíos en la semana: no se prueba la hoja.");
  const d = await armarDia(dia);
  ver(`se arma el día ${dia}`, d.dia === dia, `${Date.now() - t} ms`);
  try {
    const r = await mandarHoja(dia, [{ pedidoId: c.pedidoId, origen: c.origen, envioMl: c.envioMl, zonaId: c.zona?.id ?? null }]);
    ver("se crea la hoja con link", "ok" in r && !!r.token);
    if (!("ok" in r) || !r.token) return;
    const token = r.token;
    ver("el link vale hasta el final del día siguiente", r.vence.slice(0, 10) >= masUno(dia), r.vence);
    const h = await hojaDelRepartidor(token);
    ver("el link abre la hoja", !!h && h.envios.length === 1 && h.dia === dia);
    const e = h!.envios[0];
    ver("trae dirección y Maps", !!e.direccion && !!e.mapa);
    ver("trae zona y precio, y no el producto", !!e.zona && e.precio != null && !("productos" in e), `${e.zona} ${e.precio}`);
    ver("un token inventado no abre nada", (await hojaDelRepartidor("x".repeat(43))) === null);
    ver("marca Lo llevo", "ok" in (await marcarDesdeLink(token, e.id, { estado: "tomado" })));
    ver("marca Entregado", "ok" in (await marcarDesdeLink(token, e.id, { estado: "entregado" })));
    ver("un estado inventado no", "error" in (await marcarDesdeLink(token, e.id, { estado: "pagado" })));
    const otro = await marcarDesdeLink("y".repeat(43), e.id, { estado: "rechazado" });
    ver("otro token no puede marcarlo", "error" in otro && otro.status === 410);
    const h2 = await hojaDelRepartidor(token);
    ver("la semana del repartidor suma el entregado", (h2?.semana.entregados ?? 0) >= 1);
    const s = (await semanas(2)).find((w) => w.desde <= dia && w.hasta >= dia);
    ver("la semana lo cuenta", !!s && s.entregados >= 1, s ? `${s.entregados} entregados, $${s.total}` : "");
    const otraVez = await mandarHoja(dia, [{ pedidoId: c.pedidoId, origen: c.origen, envioMl: c.envioMl, zonaId: c.zona?.id ?? null }]);
    ver("guardar de nuevo deja el mismo link", "ok" in otraVez && otraVez.token === null && !!(await hojaDelRepartidor(token)));
    ver("y no borra lo que marcó", (await hojaDelRepartidor(token))?.envios[0]?.estado === "entregado");
    const nuevo = await mandarHoja(dia, [{ pedidoId: c.pedidoId, origen: c.origen, envioMl: c.envioMl, zonaId: c.zona?.id ?? null }], { linkNuevo: true });
    const tokenNuevo = "ok" in nuevo ? nuevo.token : null;
    ver("Link nuevo: el viejo deja de andar y el nuevo abre", !!tokenNuevo && (await hojaDelRepartidor(token)) === null && !!(await hojaDelRepartidor(tokenNuevo)));
    await prisma.hojaReparto.update({ where: { tenantId_dia: { tenantId: "sendero3d", dia: fecha(dia) } }, data: { vence: new Date(Date.now() - 1000) } });
    ver("el link vencido no abre", (await hojaDelRepartidor(tokenNuevo ?? token)) === null);
  } finally {
    const del = await prisma.hojaReparto.deleteMany({ where: { tenantId: "sendero3d", dia: fecha(dia) } });
    console.log(`\nhoja de prueba borrada (${del.count})`);
  }
  console.log(`${ok} de ${ok + mal}`);
  process.exitCode = mal ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
