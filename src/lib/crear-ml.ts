import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/mercadolibre";
import { cargarContextoDePrecios, gastosDe, pctDeCombinacion, preciosDeCombinaciones } from "@/lib/precios-combinacion";
import { costosDeOpcionDos, costosDeOpcionUno, gastosConCostos, precioParaGanancia } from "@/lib/precios-ml-publicacion";
import { margenDe } from "@/lib/precios-formula";
import { cargoFijo } from "@/lib/tarifas-ml-reglas";
import { categoriaDeProducto, describirCategoria } from "@/lib/categorias-ml";

/**
 * Crear en Mercado Libre una combinación que no está publicada (docs/sdd/006, spec 008, TASK-017).
 *
 * Nunca automático: sale de un botón en la página del producto, con un borrador que Agustín revisa,
 * una validación contra ML que no crea nada (`/items/validate`) y la creación sólo al confirmar.
 *
 * Lo aprendido con el Dumpling (MLA2249115007, 2026-10-30):
 * - ML usa User Products: \`family_name\` en vez de título; marca, modelo, motivo sin código de
 *   barras y medidas del paquete son obligatorios; sin foto no deja crear.
 * - \`status: "paused"\` al crear no sirve: se crea activa y se pausa en el paso siguiente.
 * - Los avisos de \`validate\` ("User has not mode me1", "Free shipping costs exceeds sale") no
 *   bloquean la creación.
 */

/** Lo que no puede decir una publicación (RN-2; las reglas de cara al cliente de Sendero). */
const PROHIBIDAS = [/impresi[oó]n\s*3d/i, /\bimprim/i, /\bimpres[oa]s?\b/i, /\bimpresora/i, /\bPLA\b/, /sendero\s*3d/i, /r[eé]plica/i, /\btipo\b/i, /s[ií]mil/i];

export interface Paquete {
  alto: number;
  ancho: number;
  largo: number;
  peso: number;
}

export interface Borrador {
  combinacionId: string;
  producto: string;
  nombre: string;
  categoria: { id: string; nombre: string; comision: number | null; origen: string } | null;
  costo: number;
  opcion1: { precio: number; paga: number; ganancia: number; margen: number };
  /** La opción 2 (3 cuotas y envío gratis) dejando lo mismo; el envío es estimado si no hay cotización. */
  opcion2: { precio: number; ganancia: number; margen: number; envioEstimado: boolean } | null;
  /** false si la opción 2 sale más del doble que la 1: no se va a vender. */
  recomendarOpcion2: boolean;
  fotos: string[];
  stock: number;
  peso: number | null;
}

export interface PedidoDeCreacion {
  combinacionId: string;
  nombre: string;
  categoria: string;
  precio1: number;
  opcion2: boolean;
  precio2: number | null;
  paquete: Paquete;
  stock: number;
  fotos: string[];
}

export interface Revision {
  opcion: 1 | 2;
  errores: string[];
  avisos: string[];
}

export interface Creada {
  opcion: 1 | 2;
  mla: string | null;
  estado: "creada" | "error";
  pausada: boolean;
  link: string | null;
  motivo: string | null;
}

/** Lo que el ERP propone para publicar una combinación. */
export async function borrador(tenantId: string, modeloId: string, combinacionId: string): Promise<Borrador> {
  const cx = await cargarContextoDePrecios(tenantId);
  if (!cx.erp) throw new Error("Crear en ML usa la configuración de precios del ERP.");
  const p = (await preciosDeCombinaciones(tenantId, { modeloIds: [modeloId] }, cx)).find((x) => x.combinacionId === combinacionId);
  if (!p) throw new Error("La combinación no existe o está inactiva.");
  if (!p.precios || !p.costo) throw new Error("La combinación no tiene costo: no hay precio para publicar.");
  const [modelo, stock, cat] = await Promise.all([
    prisma.modelo.findFirst({ where: { id: modeloId, tenantId }, select: { nombre: true, pesoGr: true, imagenUrl: true, imagenesUrls: true } }),
    prisma.stock.findMany({ where: { tenantId, modeloId }, select: { cantidad: true } }),
    categoriaDeProducto(tenantId, modeloId),
  ]);
  const t = cx.erp.tarifas;
  const g = gastosDe(cx.general.gastos, p.politica);
  const pct = cat?.comision ?? pctDeCombinacion(cx, combinacionId, modeloId);
  const fab = p.costo.fabricacion;
  const ins = p.costo.insumos;
  const deja = (final: number, c: ReturnType<typeof costosDeOpcionUno>) => {
    const r = margenDe(gastosConCostos(g, c, t?.fijos.length ? cargoFijo(t, final) : g.mlCargoFijo), "ml", final, fab, ins);
    return { ganancia: Math.round(r.ganancia), margen: Math.round(r.margen * 10) / 10 };
  };
  const uno = costosDeOpcionUno(g, pct);
  const op1 = { precio: p.precios.mlPublicado, paga: p.precios.ml, ...deja(p.precios.ml, uno) };
  let op2: Borrador["opcion2"] = null;
  if (p.precios.ganancia != null) {
    const c2 = costosDeOpcionDos(t, g, pct, null);
    const r = precioParaGanancia(g, fab, ins, p.politica.redondeo, p.precios.ganancia, c2, t);
    if (Number.isFinite(r.publicado)) op2 = { precio: r.publicado, ...deja(r.final, c2), envioEstimado: c2.estimado.includes("costo del envío") };
  }
  const fotos = [...new Set([...(modelo?.imagenesUrls ?? []), ...(modelo?.imagenUrl ? [modelo.imagenUrl] : [])])];
  return {
    combinacionId,
    producto: p.nombre,
    nombre: p.nombre === modelo?.nombre ? p.nombre : p.nombre.replace(" · ", " "),
    categoria: cat,
    costo: Math.round(fab + ins),
    opcion1: op1,
    opcion2: op2,
    recomendarOpcion2: !!op2 && op2.precio <= op1.precio * 2,
    fotos,
    stock: Math.max(1, stock.reduce((a, s) => a + s.cantidad, 0)),
    peso: modelo?.pesoGr ?? null,
  };
}

function cuerpoDe(p: PedidoDeCreacion, opcion: 1 | 2): Record<string, unknown> {
  return {
    family_name: p.nombre.trim(),
    category_id: p.categoria,
    price: opcion === 1 ? p.precio1 : p.precio2,
    currency_id: "ARS",
    available_quantity: Math.max(1, Math.floor(p.stock)),
    buying_mode: "buy_it_now",
    condition: "new",
    // Opción 1: Clásica sin cuotas, envío según el umbral. Opción 2: Premium (3 cuotas) con envío gratis.
    listing_type_id: opcion === 1 ? "gold_special" : "gold_pro",
    ...(opcion === 2 ? { shipping: { mode: "me2", free_shipping: true } } : {}),
    pictures: p.fotos.map((source) => ({ source })),
    sale_terms: [
      { id: "WARRANTY_TYPE", value_name: "Garantía de fábrica" },
      { id: "WARRANTY_TIME", value_name: "10 días" },
    ],
    attributes: [
      { id: "BRAND", value_name: "Generic" },
      { id: "MODEL", value_name: p.nombre.trim().slice(0, 60) },
      { id: "EMPTY_GTIN_REASON", value_id: "17055160" },
      { id: "SELLER_PACKAGE_HEIGHT", value_name: `${p.paquete.alto} cm` },
      { id: "SELLER_PACKAGE_WIDTH", value_name: `${p.paquete.ancho} cm` },
      { id: "SELLER_PACKAGE_LENGTH", value_name: `${p.paquete.largo} cm` },
      { id: "SELLER_PACKAGE_WEIGHT", value_name: `${p.paquete.peso} g` },
    ],
  };
}

async function ml(tenantId: string, metodo: string, path: string, cuerpo?: unknown): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const tok = await getValidAccessToken(tenantId);
  const r = await fetch(`https://api.mercadolibre.com${path}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  try {
    return { status: r.status, json: t ? (JSON.parse(t) as Record<string, unknown>) : null };
  } catch {
    return { status: r.status, json: { message: t.slice(0, 500) } };
  }
}

/** Lo que dice el ERP y lo que dice ML (`/items/validate`) de cada opción, sin crear nada. */
export async function revisar(tenantId: string, p: PedidoDeCreacion): Promise<Revision[]> {
  const opciones: Array<1 | 2> = p.opcion2 ? [1, 2] : [1];
  return Promise.all(
    opciones.map(async (opcion) => {
      const errores: string[] = [];
      const avisos: string[] = [];
      for (const r of PROHIBIDAS) if (r.test(p.nombre)) errores.push(`El nombre dice "${p.nombre.match(r)?.[0]}": no va de cara al cliente.`);
      if (!p.fotos.length) errores.push("Falta una foto: subila en la sección Fotos del producto. Sin foto ML no deja crear.");
      if (opcion === 2 && !(p.precio2 && p.precio2 > 0)) errores.push("Falta el precio de la opción 2.");
      if ([p.paquete.alto, p.paquete.ancho, p.paquete.largo, p.paquete.peso].some((x) => !(x > 0))) errores.push("Faltan las medidas o el peso del paquete.");
      if (!errores.length) {
        const r = await ml(tenantId, "POST", "/items/validate", cuerpoDe(p, opcion));
        const causas = ((r.json?.cause as Array<{ type: string; code: string; message: string }>) ?? []);
        for (const c of causas) (c.type === "error" ? errores : avisos).push(`${c.message} (${c.code})`);
        if (r.status >= 400 && !causas.length) errores.push(String(r.json?.message ?? `ML contestó ${r.status}`));
      }
      return { opcion, errores, avisos };
    })
  );
}

/**
 * Crea las opciones pedidas, pausadas, y las deja enlazadas a la combinación. Cada una queda en
 * \`cambios_precio\` con estado "creada" o "error".
 */
export async function crear(tenantId: string, p: PedidoDeCreacion, usuario: string | null): Promise<Creada[]> {
  const revisiones = await revisar(tenantId, p);
  if (revisiones.some((r) => r.errores.length)) throw new Error(revisiones.flatMap((r) => r.errores).join(" "));
  const out: Creada[] = [];
  for (const opcion of (p.opcion2 ? [1, 2] : [1]) as Array<1 | 2>) {
    const precio = opcion === 1 ? p.precio1 : p.precio2!;
    const r = await ml(tenantId, "POST", "/items", cuerpoDe(p, opcion));
    const mla = typeof r.json?.id === "string" ? r.json.id : null;
    if (!mla) {
      const motivo = String(r.json?.message ?? `ML contestó ${r.status}`);
      await prisma.cambioPrecio.create({ data: { tenantId, canal: "mercadolibre", clave: `nueva|${p.combinacionId}|opcion${opcion}`, combinacionId: p.combinacionId, antes: null, despues: precio, estado: "error", respuesta: (r.json ?? Prisma.JsonNull) as Prisma.InputJsonValue, usuario } });
      out.push({ opcion, mla: null, estado: "error", pausada: false, link: null, motivo });
      continue;
    }
    // ML la crea activa aunque se pida pausada: se pausa enseguida.
    const pausa = await ml(tenantId, "PUT", `/items/${mla}`, { status: "paused" });
    const pausada = pausa.json?.status === "paused";
    await prisma.mapeoCanal.upsert({
      where: { tenantId_canal_clave: { tenantId, canal: "mercadolibre", clave: `${mla}|` } },
      create: { tenantId, canal: "mercadolibre", clave: `${mla}|`, combinacionId: p.combinacionId, unidades: 1, origen: "manual", descripcion: `Creada desde el ERP (opción ${opcion})`, muestra: { titulo: p.nombre } },
      update: { combinacionId: p.combinacionId },
    });
    await prisma.cambioPrecio.create({
      data: { tenantId, canal: "mercadolibre", clave: `${mla}|`, combinacionId: p.combinacionId, antes: null, despues: precio, estado: "creada", respuesta: { creada: r.json, pausa: pausa.json } as unknown as Prisma.InputJsonValue, usuario },
    });
    out.push({ opcion, mla, estado: "creada", pausada, link: typeof r.json?.permalink === "string" ? r.json.permalink : null, motivo: pausada ? null : "No se pudo pausar: pausala a mano en ML." });
  }
  // La categoría con que se creó queda como la del producto.
  const modelo = await prisma.combinacion.findUnique({ where: { id: p.combinacionId }, select: { modeloId: true } });
  if (modelo) await prisma.modelo.update({ where: { id: modelo.modeloId }, data: { categoriaMl: p.categoria, categoriaMlOrigen: "manual" } });
  return out;
}

export { describirCategoria };
