/**
 * docs/sdd/001, spec 004 — prueba de punta a punta del mapeo por canal (TASK-017),
 * con escritura, en un tenant aislado que se borra al final.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-probar-mapeo.ts
 *
 * Shop: webhooks firmados contra el handler real (sin servidor). ML: los items de
 * una orden inventada contra `resolverItemsMl`, que es lo que hace el sync antes
 * de pedirle a ML los envíos y las comisiones.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sembrarCombinaciones, sembrarCombinacionesDeModelo } from "@/lib/combinaciones";
import { agregarAccesorio, guardarReceta } from "@/lib/recetas";
import { reasignarReservas } from "@/lib/reservas";
import { claveMl, mapearClave, resolverLinea } from "@/lib/mapeo-canal";
import { resolverItemsMl } from "@/lib/mercadolibre-sync";
import { computeSignature } from "@/lib/webhook-security";
import { POST as webhookShop } from "@/app/api/webhook/shop/pedido/route";

const T = "prueba-claude-mapeo";
const SECRETO = "secreto-de-prueba-mapeo";
process.env.SHOP_WEBHOOK_SECRET = SECRETO;

let fallas = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "✔" : "✘"} ${m}`);
  if (!c) fallas++;
};

async function limpiar() {
  await prisma.reservaStock.deleteMany({ where: { tenantId: T } });
  await prisma.produccionPendiente.deleteMany({ where: { tenantId: T } });
  await prisma.mapeoCanal.deleteMany({ where: { tenantId: T } });
  await prisma.pedido.deleteMany({ where: { tenantId: T } });
  await prisma.cliente.deleteMany({ where: { tenantId: T } });
  await prisma.webhookLog.deleteMany({ where: { tenantId: T } });
  await prisma.publicacionMl.deleteMany({ where: { tenantId: T } });
  await prisma.reglaInsumo.deleteMany({ where: { tenantId: T } });
  await prisma.combinacion.deleteMany({ where: { tenantId: T } });
  await prisma.stock.deleteMany({ where: { tenantId: T } });
  await prisma.modelo.deleteMany({ where: { tenantId: T } });
  await prisma.categoria.deleteMany({ where: { tenantId: T } });
  await prisma.configTenant.deleteMany({ where: { tenantId: T } });
}

let numero = 0;
async function venderEnShop(items: unknown[]) {
  const numero_pedido = `PRU-${++numero}`;
  const body = JSON.stringify({
    evento: "pedido.confirmado",
    numero_pedido,
    estado_shop: "pago_confirmado",
    cliente: { nombre: "Cliente de prueba", email: "prueba-mapeo@example.com" },
    direccion_envio: {},
    costo_envio: 0,
    subtotal: 0,
    total: 0,
    items,
  });
  return reenviarAlShop(body, numero_pedido);
}

async function reenviarAlShop(body: string, numero_pedido: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const req = new NextRequest("http://localhost/api/webhook/shop/pedido", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-shop-tenant": T,
      "x-shop-timestamp": ts,
      "x-shop-signature": computeSignature(SECRETO, ts, body),
    },
  });
  const res = await webhookShop(req);
  const json = await res.json();
  const pedido = await prisma.pedido.findFirst({
    where: { tenantId: T, externoId: numero_pedido },
    include: { items: true },
  });
  return { status: res.status, json, pedido, body, numero_pedido };
}

async function main() {
  await limpiar();

  /* ── Catálogo de prueba ── */
  // La katana vieja (un solo producto en el Shop, con el tamaño como opción) y la
  // nueva de 95 cm, partida, con Con/Sin Funda y su funda como insumo.
  await prisma.modelo.create({ data: { tenantId: T, nombre: "Katana prueba", sku: "SS-PRU-KAT-009", activo: false } });
  const k95 = await prisma.modelo.create({
    data: { tenantId: T, nombre: "Katana prueba 95cm", sku: "SS-PRU-KAT-009-95", costoFab: 9000 },
  });
  const hoja = await prisma.stock.create({
    data: { tenantId: T, modeloId: k95.id, clave: `${k95.id}|`, etiqueta: "Katana prueba 95cm", cantidad: 5 },
  });
  const cat = await prisma.categoria.create({ data: { tenantId: T, nombre: "Insumos" } });
  const funda = await prisma.modelo.create({ data: { tenantId: T, nombre: "Funda prueba 95cm", activo: false } });
  await prisma.categoriaModelo.create({ data: { categoriaId: cat.id, modeloId: funda.id } });
  const filaFunda = await prisma.stock.create({
    data: { tenantId: T, modeloId: funda.id, clave: `${funda.id}|`, etiqueta: "Funda prueba 95cm", cantidad: 5 },
  });
  // Un llavero sin variantes que en el Shop se vende también en packs.
  const llavero = await prisma.modelo.create({
    data: { tenantId: T, nombre: "Llavero prueba", sku: "SS-PRU-LLA-001", costoFab: 500, costoInsumos: 100 },
  });
  const filaLlavero = await prisma.stock.create({
    data: { tenantId: T, modeloId: llavero.id, clave: `${llavero.id}|`, etiqueta: "Llavero prueba", cantidad: 40 },
  });

  await sembrarCombinaciones(prisma, T);
  const { con, sin } = await agregarAccesorio(T, k95.id, "funda");
  await guardarReceta(T, con, [{ stockId: filaFunda.id, cantidad: 1 }]);
  const comboLlavero = await prisma.combinacion.findFirstOrThrow({ where: { tenantId: T, modeloId: llavero.id } });
  const comboCon = await prisma.combinacion.findUniqueOrThrow({ where: { id: con } });

  /* ── Shop ── */
  console.log("\nShop");
  const katana = {
    producto_id: "prod-katana",
    sku: "SS-PRU-KAT-009",
    nombre_producto: "Katana prueba",
    cantidad: 1,
    precio_unitario: 51990,
    opciones_seleccionadas: [
      { grupo_id: "g-tam", grupo: "Tamaño", opcion_id: "op-95", nombre: "95cm", precio_extra: 0 },
      { grupo_id: "g-acc", grupo: "Accesorios", opcion_id: "op-cf", nombre: "Con Funda", precio_extra: 6000 },
    ],
  };
  const v1 = await venderEnShop([katana]);
  const l1 = v1.pedido?.items[0];
  ok(v1.status === 201, `el webhook crea el pedido (${v1.status})`);
  ok(l1?.combinacionId === con && l1?.modeloId === k95.id,
    `CA-3: la katana 95cm "Con Funda" queda con "${comboCon.nombre}" del modelo de 95 cm`);
  ok(l1?.claveCanal === "prod-katana|op-95,op-cf", `la clave es por ids: ${l1?.claveCanal}`);
  ok(!v1.pedido?.etiquetas.includes("revision_manual"), "una clave que se resuelve sola no deja el pedido a revisar");
  const mapeoK = await prisma.mapeoCanal.findFirst({ where: { tenantId: T, canal: "shop", clave: "prod-katana|op-95,op-cf" } });
  ok(mapeoK?.origen === "auto" && mapeoK.combinacionId === con && mapeoK.vecesVista === 1, "queda mapeada como automática");
  const resK = await prisma.reservaStock.findMany({ where: { pedidoId: v1.pedido!.id } });
  ok(resK.some((r) => r.stockId === hoja.id) && resK.some((r) => r.stockId === filaFunda.id), "reserva la hoja y la funda");

  const dup = await reenviarAlShop(v1.body, v1.numero_pedido);
  const mapeoK2 = await prisma.mapeoCanal.findUnique({ where: { id: mapeoK!.id } });
  ok(dup.json.duplicate === true && mapeoK2?.vecesVista === 1, "un reenvío del mismo pedido no cuenta otra venta");

  // Un pack: la opción no es una variante, así que la primera vez va a la cola.
  const pack = {
    producto_id: "prod-llavero",
    sku: "SS-PRU-LLA-001",
    nombre_producto: "Llavero prueba",
    cantidad: 1,
    precio_unitario: 22500,
    opciones_seleccionadas: [{ grupo_id: "g-pack", grupo: "Pack", opcion_id: "op-10", nombre: "Pack · 10 unidades ($2250u)", precio_extra: 0 }],
  };
  const v2 = await venderEnShop([pack]);
  const l2 = v2.pedido?.items[0];
  const mapeoPack = await prisma.mapeoCanal.findFirst({ where: { tenantId: T, canal: "shop", clave: "prod-llavero|op-10" } });
  ok(l2?.combinacionId === null && l2?.modeloId === llavero.id && l2?.cantidad === 1,
    "una clave nueva con dudas entra igual, con el modelo deducido y sin combinación");
  ok(v2.pedido?.etiquetas.includes("revision_manual") === true, "CA-5: el pedido queda con revision_manual");
  ok(mapeoPack?.combinacionId === null && mapeoPack.descripcion === "Llavero prueba · Pack: Pack · 10 unidades ($2250u)" &&
    mapeoPack.ultimaVenta === v2.numero_pedido, `CA-5: la clave está en la cola con la descripción y la última venta`);

  const m = await mapearClave(prisma, T, mapeoPack!.id, { combinacionId: comboLlavero.id, unidades: 10 });
  await reasignarReservas(T);
  const l2b = await prisma.itemPedido.findUnique({ where: { id: l2!.id } });
  const resPack = await prisma.reservaStock.findMany({ where: { pedidoId: v2.pedido!.id, stockId: filaLlavero.id } });
  ok(m.lineasCompletadas === 1 && l2b?.combinacionId === comboLlavero.id && l2b.cantidad === 10 && l2b.precioUnitario === 2250 &&
    l2b.costoUnitario === 600, `CA-6: al mapearla, la línea abierta queda con 10 × $2250 y costo $600 (${l2b?.cantidad} × ${l2b?.precioUnitario}, costo ${l2b?.costoUnitario})`);
  ok(resPack.reduce((a, r) => a + r.cantidad, 0) === 10, `CA-6: y se reservan 10 llaveros (${resPack.reduce((a, r) => a + r.cantidad, 0)})`);

  const v3 = await venderEnShop([pack]);
  const l3 = v3.pedido?.items[0];
  ok(l3?.combinacionId === comboLlavero.id && l3.cantidad === 10 && l3.precioUnitario === 2250 && !v3.pedido?.etiquetas.includes("revision_manual"),
    `CA-4: la venta siguiente del pack entra sola con 10 unidades a $2250 (${l3?.cantidad} × ${l3?.precioUnitario})`);

  // Sin ids (el Shop de hoy): clave transitoria por SKU y opciones.
  const v4 = await venderEnShop([
    { sku: "SS-PRU-KAT-009", nombre_producto: "Katana prueba", cantidad: 1, precio_unitario: 45990,
      opciones_seleccionadas: [{ grupo: "Tamaño", nombre: "95cm" }, { grupo: "Accesorios", nombre: "Sin Funda" }] },
  ]);
  ok(v4.pedido?.items[0]?.claveCanal === "sku:SS-PRU-KAT-009|95cm,sin funda" && v4.pedido?.items[0]?.combinacionId === sin,
    `sin ids usa la clave transitoria y resuelve igual: ${v4.pedido?.items[0]?.claveCanal}`);

  // A medida: no se mapea.
  const antes = await prisma.mapeoCanal.count({ where: { tenantId: T } });
  const v5 = await venderEnShop([{ nombre_producto: "Espada de un dibujo", cantidad: 1, precio_unitario: 80000, personalizado: true }]);
  ok(v5.pedido?.items[0]?.modeloId === null && (await prisma.mapeoCanal.count({ where: { tenantId: T } })) === antes,
    "una línea a medida entra sin modelo y no crea clave");

  // Otro negocio: un pedido que es sólo eso no se carga.
  await mapearClave(prisma, T, mapeoK!.id, { ignorar: true });
  const v6 = await venderEnShop([katana]);
  ok(v6.status === 200 && v6.json.ignorado === "otro_negocio" && !v6.pedido, "un pedido que es todo de otro negocio se registra y no se carga");
  await mapearClave(prisma, T, mapeoK!.id, { combinacionId: con });

  /* ── Mercado Libre ── */
  console.log("\nMercado Libre");
  await prisma.publicacionMl.createMany({
    data: [
      { tenantId: T, mla: "MLA900001", modeloId: llavero.id, titulo: "Llavero prueba colores" },
      { tenantId: T, mla: "MLA900002", modeloId: k95.id, titulo: "Katana prueba 95cm" },
      { tenantId: T, mla: "MLA900003", ignorar: true, titulo: "Juguete de Shay" },
    ],
  });
  const item = (mla: string, title: string, variation_id: number | null, atributos: Array<[string, string]>, unit_price = 10000) => ({
    item: { id: mla, title, variation_id, variation_attributes: atributos.map(([name, value_name]) => ({ name, value_name })) },
    quantity: 1,
    unit_price,
  });

  let avisos: string[] = [];
  let r = await resolverItemsMl(T, [item("MLA900001", "Llavero prueba colores", 111, [["Color", "Rojo"]])], "ML-1", avisos);
  const mapeoMl1 = await prisma.mapeoCanal.findFirst({ where: { tenantId: T, canal: "mercadolibre", clave: claveMl("MLA900001", 111) } });
  ok(r.itemsData[0]?.combinacionId === comboLlavero.id && mapeoMl1?.origen === "auto" && avisos.length === 0,
    "un color en un modelo sin variantes se resuelve solo (es una sola cosa)");
  ok(JSON.stringify(r.itemsData[0]?.variantesInfo) === JSON.stringify([{ mlAtributo: "Color", nombre: "Rojo", matched: false }]),
    "el color queda guardado como registro, para saber qué imprimir");

  avisos = [];
  r = await resolverItemsMl(T, [item("MLA900002", "Katana prueba 95cm", null, [])], "ML-2", avisos);
  ok(r.itemsData[0]?.combinacionId === null && r.itemsData[0]?.modeloId === k95.id && r.itemsData[0]?.claveCanal === "MLA900002|" &&
    avisos.some((a) => a.startsWith("Variación sin mapear")),
    "una katana que no dice si lleva funda va a la cola y entra con el modelo, a revisar");

  avisos = [];
  r = await resolverItemsMl(T, [item("MLA900003", "Juguete de Shay", null, [])], "ML-3", avisos);
  ok(r.itemsIgnorados === 1 && r.itemsData.length === 0, "una publicación de otro negocio se descarta");

  const mapeoMl2 = await prisma.mapeoCanal.findFirstOrThrow({ where: { tenantId: T, canal: "mercadolibre", clave: "MLA900002|" } });
  await mapearClave(prisma, T, mapeoMl2.id, { combinacionId: con });
  avisos = [];
  r = await resolverItemsMl(T, [item("MLA900002", "Katana prueba 95cm", null, [])], "ML-4", avisos);
  ok(r.itemsData[0]?.combinacionId === con && avisos.length === 0, "CA-2: mapeada a mano, la venta siguiente toma la combinación sin mirar nombres");
  ok(r.itemsData[0]?.costoUnitario === 9000 + (comboCon ? (await prisma.varianteModelo.findFirstOrThrow({ where: { modeloId: k95.id, nombre: "Con Funda" } })).costoFabAdicional : 0),
    `y el costo es el del modelo más la variante (${r.itemsData[0]?.costoUnitario})`);

  // RN-6: una clave que se dejó a mano en la cola no la pisa la resolución automática.
  await mapearClave(prisma, T, mapeoMl1!.id, { combinacionId: null });
  const rn6 = await resolverLinea(prisma, T, "mercadolibre", mapeoMl1!.clave, {
    sugerencia: { modeloId: llavero.id, variantes: [], sinDudas: true },
  });
  ok(rn6.tipo === "cola", "RN-6: un mapeo manual no lo pisa la resolución automática");

  // Un diseño que todavía no existe como variante: en el Shop es una duda (RN-8).
  console.log("\nCatálogo que se completa después");
  const ballena = {
    producto_id: "prod-llavero",
    sku: "SS-PRU-LLA-001",
    nombre_producto: "Llavero prueba",
    cantidad: 2,
    precio_unitario: 3000,
    opciones_seleccionadas: [{ grupo_id: "g-mod", grupo: "Modelo", opcion_id: "op-ballena", nombre: "Ballena", precio_extra: 0 }],
  };
  const v7 = await venderEnShop([ballena]);
  ok(v7.pedido?.items[0]?.combinacionId === null, "un diseño que no es variante del modelo va a la cola");

  // Un modelo que pasa a tener variantes: "el modelo solo" se desactiva y su
  // mapeo automático vuelve a resolverse.
  const mapeoAuto = await prisma.mapeoCanal.findFirstOrThrow({ where: { tenantId: T, clave: "prod-llavero|op-10" } });
  await prisma.mapeoCanal.update({ where: { id: mapeoAuto.id }, data: { origen: "auto" } });
  await prisma.varianteModelo.createMany({ data: [{ modeloId: llavero.id, nombre: "Ballena" }, { modeloId: llavero.id, nombre: "Delfín" }] });
  await sembrarCombinacionesDeModelo(prisma, T, llavero.id);
  const plano = await prisma.combinacion.findUniqueOrThrow({ where: { id: comboLlavero.id } });
  const rVar = await resolverLinea(prisma, T, "shop", "prod-llavero|op-10", {
    sugerencia: { modeloId: llavero.id, variantes: [], sinDudas: true },
  });
  ok(!plano.activo && rVar.tipo === "cola",
    "cuando el modelo suma variantes, el modelo solo se desactiva y su clave vuelve a la cola");

  // Con la variante cargada, la venta siguiente se resuelve sola y completa la
  // línea que había quedado esperando.
  const v8 = await venderEnShop([ballena]);
  const comboBallena = await prisma.combinacion.findFirst({ where: { tenantId: T, modeloId: llavero.id, nombre: "Llavero prueba · Ballena" } });
  const l7 = await prisma.itemPedido.findUnique({ where: { id: v7.pedido!.items[0].id } });
  ok(v8.pedido?.items[0]?.combinacionId === comboBallena?.id && l7?.combinacionId === comboBallena?.id && l7?.cantidad === 2,
    "con la variante cargada, la venta siguiente entra sola y completa la línea que esperaba");
}

main()
  .catch((e) => {
    console.error(e);
    fallas++;
  })
  .finally(async () => {
    await limpiar();
    const quedan = (await prisma.modelo.count({ where: { tenantId: T } })) + (await prisma.mapeoCanal.count({ where: { tenantId: T } }));
    console.log(quedan === 0 ? "\nTenant de prueba borrado" : `\n✘ quedaron ${quedan} filas`);
    console.log(fallas ? `${fallas} FALLAS` : "TODO OK");
    await prisma.$disconnect();
    process.exit(fallas ? 1 : 0);
  });
