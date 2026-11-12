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

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
