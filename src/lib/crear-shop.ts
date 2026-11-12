import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { grupoDeVariante } from "@/lib/catalogo";
import { paqueteDeSusPublicaciones } from "@/lib/crear-ml";
import { preciosDeCombinaciones } from "@/lib/precios-combinacion";
import { configShop, firmarParaShop } from "@/lib/precios-shop";
import { leerCategoriasShop } from "@/lib/sembrar-shop";

/**
 * Crear un producto del ERP en el Shop y dejarlo mapeado (contrato 7c, docs/sdd/009 del ERP y
 * docs/sdd/024 del Shop).
 *
 * Nunca automático: el ERP arma el borrador, el Shop lo revisa sin crear nada (`simular`) y sólo al
 * confirmar lo crea, **oculto**. El Shop responde la clave de cada combinación y acá se mapea en el
 * mismo paso, así la primera venta de la web ya entra resuelta. Agustín lo termina y lo activa en el
 * panel del Shop.
 *
 * Lo que va siempre sale de la base en el momento de mandar, no de la pantalla: las variantes, el
 * precio web de cada combinación y las fotos. La pantalla sólo cambia nombre, descripción,
 * categoría, peso, medidas y qué fotos van.
 */

/** Sólo estas fotos acepta el Shop: las del bucket `imagenes` del ERP. */
const DE_NUESTRO_BUCKET = "/storage/v1/object/public/imagenes/";
const MAX_FOTOS = 15;

export interface CombinacionShop {
  combinacionId: string;
  nombre: string;
  /** Las opciones de la combinación, por su `ref` (el id de la variante del ERP). */
  opciones: string[];
  /** El precio web; null si la combinación no tiene precio todavía. */
  precio: number | null;
  falta: string | null;
}

export interface BorradorShop {
  nombre: string;
  sku: string | null;
  peso: number | null;
  paquete: { alto: number; ancho: number; largo: number } | null;
  /** De qué publicación de ML salieron las medidas, si salieron de ahí. */
  paqueteDe: string | null;
  categorias: Array<{ id: string; nombre: string }>;
  grupos: Array<{ nombre: string; opciones: Array<{ ref: string; valor: string }> }>;
  combinaciones: CombinacionShop[];
  fotos: string[];
  /** Lo que impide mandarlo y hay que arreglar en el ERP antes. */
  problemas: string[];
  /** Combinaciones que ya tienen una clave del Shop: el producto ya está en la web. */
  yaEnShop: number;
}

export interface PedidoShop {
  nombre: string;
  descripcion: string | null;
  categoriaId: string | null;
  peso: number | null;
  alto: number | null;
  ancho: number | null;
  largo: number | null;
  fotos: string[];
}

export interface ErrorShop {
  campo: string;
  motivo: string;
}

export type RespuestaShop =
  | {
      estado: "ok";
      producto: {
        slug: string;
        nombre: string;
        precio_base: number;
        adicionales: Array<{ ref: string; precio_adicional: number }>;
        reglas: Array<{ ref: string; cuando_ref: string; precio_adicional: number }>;
        categoria_id: string | null;
        fotos: Array<{ url: string; bytes: number; ancho: number; alto: number }>;
      };
      errores: ErrorShop[];
    }
  | { estado: "rechazado"; errores: ErrorShop[] }
  | {
      estado: "creado" | "ya_existe";
      producto_id: string;
      slug: string;
      opciones: Record<string, string>;
      combinaciones: Array<{ opciones: string[]; precio: number; clave_shop: string }>;
    };

export interface ResultadoShop {
  respuesta: RespuestaShop;
  /** Al crear: cuántas combinaciones quedaron mapeadas. */
  mapeadas: number;
  /** Al crear: el link al producto en el panel del Shop. */
  panel: string | null;
}

/** Las variantes, combinaciones y precios del producto, como los pide el Shop. */
async function armar(tenantId: string, modeloId: string) {
  const [modelo, combinaciones, precios] = await Promise.all([
    prisma.modelo.findFirst({
      where: { id: modeloId, tenantId },
      select: { nombre: true, sku: true, pesoGr: true, imagenesUrls: true, imagenUrl: true, esInsumo: true },
    }),
    prisma.combinacion.findMany({ where: { tenantId, modeloId, activo: true }, select: { id: true, nombre: true, variantes: true }, orderBy: { nombre: "asc" } }),
    preciosDeCombinaciones(tenantId, { modeloIds: [modeloId] }),
  ]);
  if (!modelo) throw new Error("El producto no existe.");
  const usadas = [...new Set(combinaciones.flatMap((c) => c.variantes))];
  const variantes = usadas.length
    ? await prisma.varianteModelo.findMany({ where: { id: { in: usadas }, modeloId }, select: { id: true, nombre: true, grupo: true, afectaStock: true } })
    : [];
  const porId = new Map(variantes.map((v) => [v.id, v]));

  // Los grupos en el orden en que aparecen; las opciones, por nombre.
  const grupos = new Map<string, Array<{ ref: string; valor: string }>>();
  for (const v of [...variantes].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }))) {
    const g = grupoDeVariante(v);
    grupos.set(g, [...(grupos.get(g) ?? []), { ref: v.id, valor: v.nombre }]);
  }

  const precioDe = new Map(precios.map((p) => [p.combinacionId, p]));
  const problemas: string[] = [];
  const combs: CombinacionShop[] = combinaciones.map((c) => {
    const p = precioDe.get(c.id);
    const precio = p?.precios ? Math.round(p.precios.web) : null;
    return { combinacionId: c.id, nombre: c.nombre, opciones: c.variantes.filter((v) => porId.has(v)), precio, falta: precio == null ? "sin precio: falta costear" : null };
  });
  if (modelo.esInsumo) problemas.push("Es un insumo: no se vende en la web.");
  if (!modelo.sku) problemas.push("Falta el SKU del producto: el Shop lo usa para no duplicarlo.");
  if (!combs.length) problemas.push("No tiene combinaciones activas.");
  const sinPrecio = combs.filter((c) => c.precio == null);
  if (sinPrecio.length) problemas.push(`${sinPrecio.length} ${sinPrecio.length === 1 ? "combinación no tiene" : "combinaciones no tienen"} precio: falta costearlas.`);
  // El Shop pide una opción de cada grupo en cada combinación.
  const incompletas = combs.filter((c) => new Set(c.opciones.map((r) => grupoDeVariante(porId.get(r)!))).size !== grupos.size);
  if (incompletas.length) problemas.push(`${incompletas.map((c) => c.nombre).join(", ")}: no tiene una opción de cada grupo.`);

  const fotos = [...new Set([...modelo.imagenesUrls, ...(modelo.imagenUrl ? [modelo.imagenUrl] : [])])].filter((u) => u.includes(DE_NUESTRO_BUCKET)).slice(0, MAX_FOTOS);
  return {
    modelo,
    grupos: [...grupos].map(([nombre, opciones]) => ({ nombre, opciones })),
    combinaciones: combs,
    fotos,
    problemas,
  };
}

/** Lo que el ERP propone mandar al Shop. Sólo lectura. */
export async function borradorShop(tenantId: string, modeloId: string): Promise<BorradorShop> {
  const a = await armar(tenantId, modeloId);
  const [paquete, categorias, yaEnShop] = await Promise.all([
    paqueteDeSusPublicaciones(tenantId, modeloId).catch(() => null),
    leerCategoriasShop().catch(() => []),
    prisma.mapeoCanal.count({ where: { tenantId, canal: "shop", ignorar: false, combinacion: { modeloId } } }),
  ]);
  return {
    nombre: a.modelo.nombre,
    sku: a.modelo.sku,
    peso: paquete?.paquete.peso ?? a.modelo.pesoGr ?? null,
    paquete: paquete ? { alto: paquete.paquete.alto, ancho: paquete.paquete.ancho, largo: paquete.paquete.largo } : null,
    paqueteDe: paquete?.mla ?? null,
    categorias,
    grupos: a.grupos,
    combinaciones: a.combinaciones,
    fotos: a.fotos,
    problemas: a.problemas,
    yaEnShop,
  };
}

const redondo = (n: number | null) => (n != null && n > 0 ? Math.ceil(n) : undefined);

/**
 * Revisa (`simular`) o crea el producto en el Shop. Al crear, o si el Shop ya lo tenía de un intento
 * anterior (`ya_existe`), mapea cada combinación a su clave del Shop.
 */
export async function mandarAlShop(tenantId: string, modeloId: string, p: PedidoShop, simular: boolean, usuario: string | null): Promise<ResultadoShop> {
  const cfg = configShop();
  if (!cfg) throw new Error("Falta SHOP_WEBHOOK_SECRET en el ERP.");
  const a = await armar(tenantId, modeloId);
  if (a.problemas.length) throw new Error(a.problemas.join(" "));
  // Sólo fotos del producto, y del bucket: no se manda una dirección que venga de la pantalla.
  const fotos = p.fotos.filter((u) => a.fotos.includes(u));

  const cuerpo = JSON.stringify({
    simular,
    producto: {
      nombre: p.nombre.trim(),
      sku: a.modelo.sku,
      ...(p.descripcion?.trim() ? { descripcion: p.descripcion.trim() } : {}),
      peso_gr: redondo(p.peso),
      alto_cm: redondo(p.alto),
      ancho_cm: redondo(p.ancho),
      largo_cm: redondo(p.largo),
      categoria_id: p.categoriaId || null,
      grupos: a.grupos.map((g, i) => ({ nombre: g.nombre, orden: i, opciones: g.opciones.map((o, j) => ({ ref: o.ref, valor: o.valor, orden: j })) })),
      combinaciones: a.combinaciones.map((c) => ({ opciones: c.opciones, precio: c.precio })),
      fotos,
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const r = await fetch(`${cfg.url}/api/inventario/productos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-inventario-timestamp": timestamp, "x-inventario-signature": firmarParaShop(cfg.secreto, timestamp, cuerpo) },
    body: cuerpo,
    // El Shop baja y optimiza cada foto: puede tardar. Tiene hasta 5 minutos.
    signal: AbortSignal.timeout(290_000),
  });
  const respuesta = (await r.json().catch(() => null)) as (RespuestaShop & { error?: string }) | null;
  if (!r.ok || !respuesta?.estado) throw new Error(`El Shop respondió ${r.status}${respuesta?.error ? `: ${respuesta.error}` : ""}.`);
  if (respuesta.estado !== "creado" && respuesta.estado !== "ya_existe") return { respuesta, mapeadas: 0, panel: null };

  // El mapeo, en el mismo paso: cada combinación con su clave. La combinación se reconoce por sus refs.
  const llave = (refs: string[]) => [...refs].sort().join(",");
  const porRefs = new Map(a.combinaciones.map((c) => [llave(c.opciones), c]));
  let mapeadas = 0;
  for (const c of respuesta.combinaciones) {
    const comb = porRefs.get(llave(c.opciones));
    if (!comb) continue;
    await prisma.mapeoCanal.upsert({
      where: { tenantId_canal_clave: { tenantId, canal: "shop", clave: c.clave_shop } },
      create: { tenantId, canal: "shop", clave: c.clave_shop, combinacionId: comb.combinacionId, unidades: 1, origen: "manual", descripcion: "Creado desde el ERP", muestra: { titulo: p.nombre.trim() } },
      update: { combinacionId: comb.combinacionId, ignorar: false },
    });
    if (respuesta.estado === "creado") {
      await prisma.cambioPrecio.create({
        data: { tenantId, canal: "shop", clave: c.clave_shop, combinacionId: comb.combinacionId, antes: null, despues: c.precio, estado: "creada", respuesta: { producto_id: respuesta.producto_id, slug: respuesta.slug } as Prisma.InputJsonValue, usuario },
      });
    }
    mapeadas++;
  }
  return { respuesta, mapeadas, panel: `${cfg.url}/admin/productos/${respuesta.producto_id}` };
}
