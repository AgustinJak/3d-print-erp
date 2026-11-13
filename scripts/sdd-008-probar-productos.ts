/**
 * docs/sdd/008 — pruebas puras de la lista de Productos: filtros por variante, orden, grupos y
 * lo elegido.
 *
 *   npx tsx scripts/sdd-008-probar-productos.ts
 *
 * No lee la base.
 */
import {
  agrupar,
  alternar,
  diferenciasDe,
  estadoDeTilde,
  filtrar,
  FILTROS_INICIALES,
  ordenar,
  resumir,
  type CanalesDeModelo,
  type CombinacionLista,
  type Filtros,
  type ProductoLista,
  type PublicacionMl,
} from "@/lib/productos-lista";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

const pub = (mla: string, x: Partial<PublicacionMl> = {}): PublicacionMl => ({ mla, estado: "active", flex: false, dias: null, premium: false, ...x });
const comb = (id: string, x: Partial<CombinacionLista> = {}): CombinacionLista => ({ id, nombre: id, corto: id, stock: 0, vendidas30: 0, vendidas: 0, publicaciones: [], web: false, ...x });
const prod = (id: string, x: Partial<ProductoLista> = {}): ProductoLista => ({
  id,
  nombre: id,
  sku: `SKU-${id}`,
  serie: null,
  costoFab: 100,
  costoInsumos: 0,
  archivo3mfUrl: null,
  imagenUrl: null,
  activo: true,
  creadoEn: "2026-01-01T00:00:00Z",
  categorias: [],
  variantes: [],
  ...x,
});
const canal = (combinaciones: CombinacionLista[]): CanalesDeModelo => ({
  ml: { activas: 0, pausadas: 0, otras: 0 },
  mlas: [],
  entrega: { flex: 0, aPedido: 0 },
  web: 0,
  sinMl: [],
  combinaciones,
  stock: combinaciones.reduce((s, c) => s + (c.stock ?? 0), 0),
  vendidas30: combinaciones.reduce((s, c) => s + c.vendidas30, 0),
  vendidas: combinaciones.reduce((s, c) => s + c.vendidas, 0),
});

// El caso de Agustín: un porta auricular con colores con stock y sin stock.
const nube = prod("nube", { nombre: "Porta auricular NUBE", serie: "Porta Auricular" });
const angel = prod("angel", { nombre: "Porta auricular Angel", serie: "porta auricular", creadoEn: "2026-02-01T00:00:00Z" });
const katana = prod("katana", {
  nombre: "Katana",
  serie: "One Piece",
  creadoEn: "2026-03-01T00:00:00Z",
  categorias: [{ categoria: { id: "c1", nombre: "Katanas", color: null } }, { categoria: { id: "c2", nombre: "Varios", color: null } }],
});
const suelto = prod("suelto", { nombre: "Sin variantes activas", activo: false });
const productos = [nube, angel, katana, suelto];
const canales: Record<string, CanalesDeModelo> = {
  nube: canal([
    comb("violeta", { stock: 1, publicaciones: [pub("MLA1", { dias: 2 })], web: true }),
    comb("blanco", { stock: 0, publicaciones: [pub("MLA2", { dias: 2 })] }),
    comb("celeste", { stock: 3, vendidas30: 4, publicaciones: [pub("MLA3", { flex: true }), pub("MLA4", { premium: true, estado: "paused" })] }),
  ]),
  angel: canal([comb("angel-unica", { stock: 2, vendidas30: 9, vendidas: 30 })]),
  katana: canal([comb("k95", { vendidas30: 1, publicaciones: [pub("MLA9", { estado: "otro" })] })]),
};
const con = (x: Partial<Filtros>): Filtros => ({ ...FILTROS_INICIALES, estado: "todos", ...x });
const ids = (fs: ReturnType<typeof filtrar>) => fs.map((f) => `${f.p.id}:${f.unidades.map((u) => u.clave).join(",")}`).join(" ");
const ver = (x: Partial<Filtros>) => ids(filtrar(productos, canales, con(x)));

{
  const f = filtrar(productos, canales, FILTROS_INICIALES);
  ok(f.length === 3 && f.every((x) => !x.parcial), "por defecto, los activos con todas sus variantes", ids(f));
  ok(filtrar(productos, canales, con({})).find((x) => x.p.id === "suelto")?.unidades[0].clave === "m:suelto", "un producto sin variantes activas se elige entero");
}
{
  const f = filtrar(productos, canales, con({ stock: "con", entrega: "a_pedido" }));
  ok(ids(f) === "nube:violeta" && f[0].parcial, "con stock y a pedido: sólo el violeta, y el producto queda a medias", ids(f));
  ok(ver({ stock: "sin" }) === "nube:blanco katana:k95 suelto:m:suelto", "sin stock incluye lo que no tiene fila de stock", ver({ stock: "sin" }));
  ok(ver({ ml: "sin" }) === "angel:angel-unica suelto:m:suelto", "sin publicar mira cada variante", ver({ ml: "sin" }));
  ok(ver({ ml: "pausados" }) === "nube:celeste", "pausados: la variante con una publicación pausada");
  ok(ver({ entrega: "flex" }) === "nube:celeste", "con Flex");
  ok(ver({ entrega: "ninguna" }) === "nube:celeste", "sin Flex ni días: no cuenta una publicación sin leer", ver({ entrega: "ninguna" }));
  ok(ver({ web: "si" }) === "nube:violeta", "en la web, por variante");
  ok(filtrar(productos, canales, con({ texto: "ANGEL" })).length === 1 && filtrar(productos, canales, con({ texto: "sku-kat" })).length === 1, "busca por nombre y por SKU, sin mayúsculas");
}
{
  const f = filtrar(productos, canales, FILTROS_INICIALES);
  const orden = (o: Parameters<typeof ordenar>[1]) => ordenar(f, o).map((x) => x.p.id).join();
  ok(orden("vendidos30") === "angel,nube,katana", "más vendidos en 30 días", orden("vendidos30"));
  ok(orden("stock_mas") === "nube,angel,katana", "más stock", orden("stock_mas"));
  ok(orden("nuevo") === "katana,angel,nube", "más reciente", orden("nuevo"));
  const g = agrupar(ordenar(f, "az"), "serie", "az");
  ok(g.length === 2 && g[1].nombre.toLowerCase() === "porta auricular" && g[1].filas.length === 2, "la serie se agrupa sin distinguir mayúsculas", g.map((x) => [x.nombre, x.filas.length]));
  const gv = agrupar(ordenar(f, "vendidos30"), "serie", "vendidos30");
  ok(gv[0].filas.length === 2, "con el orden por ventas, primero el grupo que más vende", gv.map((x) => x.nombre));
  const gc = agrupar(f, "categoria", "az");
  ok(gc.map((x) => x.nombre).join() === "Katanas,Varios,Sin categoría" && gc[2].filas.length === 2, "por categoría: un producto en cada una de las suyas, y los sin categoría al final", gc.map((x) => [x.nombre, x.filas.length]));
  ok(agrupar(f, "nada", "az").length === 1, "sin agrupar es un solo grupo");
}
{
  let e = new Set<string>();
  e = alternar(e, ["violeta"]);
  e = alternar(e, ["k95"]);
  ok(estadoDeTilde(["violeta", "blanco", "celeste"], e) === "algunas", "un producto con una variante elegida queda a medias");
  e = alternar(e, ["violeta", "blanco", "celeste"]);
  ok(e.size === 4 && estadoDeTilde(["violeta", "blanco", "celeste"], e) === "todas", "tildar el producto suma lo que falta sin tocar lo demás", [...e]);
  const r = resumir(productos, canales, e);
  ok(r.unidades === 4 && r.productos.join() === "nube,katana" && r.productosAMedias === 0, "el resumen cuenta variantes y productos", r);
  ok(r.mlas.join() === "MLA1,MLA2,MLA3,MLA4", "las publicaciones activas y pausadas de lo elegido; la sin leer no", r.mlas);
  ok(r.mlasPrincipal.join() === r.mlas.join(), "sin otra cuenta, todas son de la principal (las que se pueden copiar)", r.mlasPrincipal);
  ok(r.conStock.join() === "violeta,celeste" && r.sinStock.join() === "blanco,k95", "con stock y sin stock", [r.conStock, r.sinStock]);
  e = alternar(e, ["violeta", "blanco", "celeste"]);
  ok(e.size === 1 && e.has("k95"), "tildar de nuevo el producto saca sólo las suyas", [...e]);
  const a = resumir(productos, canales, new Set(["angel-unica", "blanco", "m:suelto"]));
  ok(a.aCrear.length === 1 && a.aCrear[0].combinacionId === "angel-unica" && a.productosAMedias === 1 && a.productos.length === 3, "a crear: sólo las variantes sin publicación", a);
}

// Dos cuentas de ML (docs/sdd/011): qué se ve y a qué se le aplica según la cuenta elegida.
{
  const SHOP = "Sendero Shop";
  const dos = prod("dos", { nombre: "Con las dos cuentas" });
  const cs: Record<string, CanalesDeModelo> = {
    dos: canal([
      comb("igual", { stock: 1, publicaciones: [pub("MLA10", { flex: true, precio: 100 }), pub("MLA20", { flex: true, precio: 100, cuenta: SHOP, copiaDe: "MLA10" })] }),
      comb("distinta", { publicaciones: [pub("MLA11", { flex: true, precio: 100 }), pub("MLA21", { dias: 5, precio: 120, estado: "paused", cuenta: SHOP, copiaDe: "MLA11" })] }),
      comb("sin-copia", { publicaciones: [pub("MLA12", { premium: true }), pub("MLA13")] }),
      comb("nada"),
    ]),
  };
  const todas = cs.dos.combinaciones;
  ok(diferenciasDe(todas[0]).length === 0, "igual en las dos cuentas: sin diferencias");
  ok(diferenciasDe(todas[1]).join() === "Flex,días,precio", "distinta: dice en qué (que esté pausada no cuenta)", diferenciasDe(todas[1]));
  ok(diferenciasDe(todas[2]).length === 0 && diferenciasDe(todas[3]).length === 0, "sin copia no hay con qué comparar");
  ok(diferenciasDe({ publicaciones: [pub("A", { premium: true, flex: true }), pub("B", { flex: false }), pub("C", { cuenta: SHOP, flex: false })] }).length === 0, "sin saber de cuál es copia, compara con la del mismo tipo");
  const v = (x: Partial<Filtros>, a: Parameters<typeof filtrar>[3]) => ids(filtrar([dos], cs, con(x), a));
  ok(v({ difieren: true }, "todas") === "dos:distinta", "el filtro de las que difieren", v({ difieren: true }, "todas"));
  ok(v({ ml: "sin" }, "otra") === "dos:sin-copia,nada" && v({ ml: "sin" }, "principal") === "dos:nada", "sin publicar mira la cuenta elegida: en la otra, las sin copiar", [v({ ml: "sin" }, "otra"), v({ ml: "sin" }, "principal")]);
  ok(v({ entrega: "flex" }, "otra") === "dos:igual" && v({ entrega: "flex" }, "principal") === "dos:igual,distinta", "la entrega también", [v({ entrega: "flex" }, "otra")]);
  ok(v({ ml: "pausados" }, "principal") === "" && v({ ml: "pausados" }, "todas") === "dos:distinta", "pausados, por cuenta");
  const e = new Set(["igual", "distinta", "sin-copia", "nada"]);
  const rt = resumir([dos], cs, e, "todas");
  ok(rt.mlas.length === 6 && rt.porCuenta.principal === 4 && rt.porCuenta.otra === 2, "en Todas, las publicaciones de las dos cuentas, con cuántas de cada una", rt.porCuenta);
  ok(rt.mlasPrincipal.join() === "MLA12,MLA13" && rt.aCrear.map((x) => x.combinacionId).join() === "nada", "a copiar: las que no tienen copia; a crear: la que no está en la principal", [rt.mlasPrincipal, rt.aCrear]);
  const rp = resumir([dos], cs, e, "principal");
  ok(rp.mlas.join() === "MLA10,MLA11,MLA12,MLA13" && rp.porCuenta.otra === 0 && rp.mlasPrincipal.length === 0 && rp.aCrear.length === 1, "en Sendero 3D no se toca la otra cuenta ni se ofrece copiar", rp);
  const ro = resumir([dos], cs, e, "otra");
  ok(ro.mlas.join() === "MLA20,MLA21" && ro.porCuenta.principal === 0 && ro.aCrear.length === 0 && ro.mlasPrincipal.length === 2, "en Sendero Shop sólo sus publicaciones; no se crea en la principal", ro);
}

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
