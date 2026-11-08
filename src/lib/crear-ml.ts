import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, mlFetch } from "@/lib/mercadolibre";
import { cargarContextoDePrecios, gastosDe, pctDeCombinacion, preciosDeCombinaciones } from "@/lib/precios-combinacion";
import { costosDeOpcionDos, costosDeOpcionUno, gastosConCostos, precioConEnvioCotizado, precioParaGanancia } from "@/lib/precios-ml-publicacion";
import { margenDe } from "@/lib/precios-formula";
import { cotizarEnvioGratis } from "@/lib/tarifas-ml";
import { cargoFijo, paqueteDeItem, type PaqueteMl } from "@/lib/tarifas-ml-reglas";
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

/** Lo que hay que hacer a mano después de crear la opción 2: la API no deja elegir las cuotas. */
export const AVISO_CUOTAS = "ML la deja en 6 cuotas: en ML, Cuotas y cargos, elegí 3 cuotas. El precio está calculado para 3.";

/** Lo que no puede decir una publicación (RN-2; las reglas de cara al cliente de Sendero). */
const PROHIBIDAS = [/impresi[oó]n\s*3d/i, /\bimprim/i, /\bimpres[oa]s?\b/i, /\bimpresora/i, /\bPLA\b/, /sendero\s*3d/i, /r[eé]plica/i, /\btipo\b/i, /s[ií]mil/i];

export type Paquete = PaqueteMl;

export interface Borrador {
  combinacionId: string;
  producto: string;
  nombre: string;
  categoria: { id: string; nombre: string; comision: number | null; origen: string } | null;
  costo: number;
  /** `envio`: lo que cotizó ML, si la opción paga envío. `envioEstimado`: lo paga y salió de la configuración. */
  opcion1: { precio: number; paga: number; ganancia: number; margen: number; envio: number | null; envioEstimado: boolean };
  /** La opción 2 (3 cuotas y envío gratis) dejando lo mismo. */
  opcion2: { precio: number; ganancia: number; margen: number; envio: number | null; envioEstimado: boolean } | null;
  /** false si la opción 2 sale más del doble que la 1: no se va a vender. */
  recomendarOpcion2: boolean;
  fotos: string[];
  stock: number;
  peso: number | null;
  /** Las medidas con que se cotizó. `de`: la publicación de la que salieron, si no las cargó nadie acá. */
  paquete: Paquete | null;
  paqueteDe: string | null;
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

/**
 * Las medidas de otra publicación del producto. Los packs no sirven, porque su paquete es otro, y las
 * de Shay quedan afuera por `ignorar`. Publicaciones del mismo producto tienen medidas distintas (una
 * katana con 6x100x6 y otra con 110x15x15): se toma la más grande, para no cotizar de menos.
 */
async function paqueteDeSusPublicaciones(tenantId: string, modeloId: string): Promise<{ paquete: Paquete; mla: string } | null> {
  const mapeos = await prisma.mapeoCanal.findMany({
    where: { tenantId, canal: "mercadolibre", ignorar: false, unidades: 1, combinacion: { modeloId } },
    select: { clave: true },
  });
  const mlas = [...new Set(mapeos.map((m) => m.clave.split("|")[0]))].slice(0, 10);
  const leidas = await Promise.all(
    mlas.map(async (mla) => {
      const item = await mlFetch<Parameters<typeof paqueteDeItem>[0]>(tenantId, `/items/${mla}?include_attributes=all`).catch(() => null);
      const paquete = item && paqueteDeItem(item);
      return paquete ? { paquete, mla } : null;
    })
  );
  const volumen = (p: Paquete) => p.alto * p.ancho * p.largo;
  return leidas.reduce((mayor, x) => (x && (!mayor || volumen(x.paquete) > volumen(mayor.paquete)) ? x : mayor), null as { paquete: Paquete; mla: string } | null);
}

/**
 * Lo que el ERP propone para publicar una combinación. Con `medidas`, o con las de otra publicación
 * del producto, el envío es el que cotiza ML. Sin ninguna de las dos, el de la configuración, marcado
 * como estimado (spec 006, RN-4).
 */
export async function borrador(tenantId: string, modeloId: string, combinacionId: string, medidas: Paquete | null = null): Promise<Borrador> {
  // Primero la categoría: si es nueva, guarda su comisión, y el precio se calcula con esa.
  const cat = await categoriaDeProducto(tenantId, modeloId);
  const cx = await cargarContextoDePrecios(tenantId);
  if (!cx.erp) throw new Error("Crear en ML usa la configuración de precios del ERP.");
  const p = (await preciosDeCombinaciones(tenantId, { modeloIds: [modeloId] }, cx)).find((x) => x.combinacionId === combinacionId);
  if (!p) throw new Error("La combinación no existe o está inactiva.");
  if (!p.precios || !p.costo) throw new Error("La combinación no tiene costo: no hay precio para publicar.");
  const [modelo, stock] = await Promise.all([
    prisma.modelo.findFirst({ where: { id: modeloId, tenantId }, select: { nombre: true, pesoGr: true, imagenUrl: true, imagenesUrls: true } }),
    prisma.stock.findMany({ where: { tenantId, modeloId }, select: { cantidad: true } }),
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
  const deOtra = medidas ? null : await paqueteDeSusPublicaciones(tenantId, modeloId);
  const paquete = medidas ?? deOtra?.paquete ?? null;
  const cotizar = async (publicado: number) => (paquete ? cotizarEnvioGratis(tenantId, paquete, publicado) : null);
  const redondeo = p.politica.redondeo;
  const ganancia = p.precios.ganancia;
  const uno = costosDeOpcionUno(g, pct);

  // La opción 1 paga envío sólo desde el umbral. Se sube hasta dejar la ganancia del producto, igual
  // que Precios cuando ya está publicada; un precio fijo a mano no se toca, se mide.
  let precio1 = p.precios.mlPublicado;
  let paga1 = p.precios.ml;
  let c1 = uno;
  let envio1: number | null = null;
  if (paga1 >= g.mlEnvioDesde) {
    if (ganancia != null && cx.erp.modelos.get(modeloId)?.precioMlFijo == null) {
      const r = await precioConEnvioCotizado((costo) => precioParaGanancia(g, fab, ins, redondeo, ganancia, { ...uno, costoEnvio: costo ?? uno.costoEnvio }, t), cotizar);
      if (r.envio != null && Number.isFinite(r.precio.publicado)) {
        precio1 = r.precio.publicado;
        paga1 = r.precio.final;
        c1 = r.precio.costos;
        envio1 = r.envio;
      }
    } else {
      envio1 = await cotizar(precio1);
      if (envio1 != null) c1 = { ...uno, costoEnvio: envio1 };
    }
  }
  const op1 = { precio: precio1, paga: paga1, ...deja(paga1, c1), envio: envio1, envioEstimado: paga1 >= g.mlEnvioDesde && envio1 == null };

  let op2: Borrador["opcion2"] = null;
  if (ganancia != null) {
    const { precio: r, envio } = await precioConEnvioCotizado((costo) => precioParaGanancia(g, fab, ins, redondeo, ganancia, costosDeOpcionDos(t, g, pct, costo), t), cotizar);
    if (Number.isFinite(r.publicado)) op2 = { precio: r.publicado, ...deja(r.final, r.costos), envio, envioEstimado: envio == null };
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
    paquete,
    paqueteDe: deOtra?.mla ?? null,
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
    // Opción 1: Clásica sin cuotas, envío según el umbral. Opción 2: Premium con envío gratis. Las
    // 3 cuotas no se pueden pedir acá: `INSTALLMENTS_CAMPAIGN` es de sólo lectura en la API y ML la
    // deja en 6 (ver AVISO_CUOTAS). Las dos, con retiro en persona.
    listing_type_id: opcion === 1 ? "gold_special" : "gold_pro",
    shipping: { mode: "me2", local_pick_up: true, ...(opcion === 2 ? { free_shipping: true } : {}) },
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
    const avisos: string[] = pausada ? [] : ["No se pudo pausar: pausala a mano en ML."];
    if (opcion === 2) avisos.push(AVISO_CUOTAS);
    // Desde acá la publicación ya existe en ML: un error no puede cortar la vuelta, porque la
    // pantalla se quedaría con "Crear pausada" a mano y volver a tocarlo la duplicaría.
    try {
      await prisma.mapeoCanal.upsert({
        where: { tenantId_canal_clave: { tenantId, canal: "mercadolibre", clave: `${mla}|` } },
        create: { tenantId, canal: "mercadolibre", clave: `${mla}|`, combinacionId: p.combinacionId, unidades: 1, origen: "manual", descripcion: `Creada desde el ERP (opción ${opcion})`, muestra: { titulo: p.nombre } },
        update: { combinacionId: p.combinacionId },
      });
      await prisma.cambioPrecio.create({
        data: { tenantId, canal: "mercadolibre", clave: `${mla}|`, combinacionId: p.combinacionId, antes: null, despues: precio, estado: "creada", respuesta: { creada: r.json, pausa: pausa.json } as unknown as Prisma.InputJsonValue, usuario },
      });
    } catch (e) {
      console.error(`[crear-ml] ${mla} se creó en ML pero no se pudo registrar:`, e);
      avisos.push("Se creó en ML, pero el ERP no la pudo registrar del todo: avisá antes de volver a crearla.");
    }
    out.push({ opcion, mla, estado: "creada", pausada, link: typeof r.json?.permalink === "string" ? r.json.permalink : null, motivo: avisos.join(" ") || null });
  }
  // La categoría con que se creó queda como la del producto.
  const modelo = await prisma.combinacion.findUnique({ where: { id: p.combinacionId }, select: { modeloId: true } });
  if (modelo) await prisma.modelo.update({ where: { id: modelo.modeloId }, data: { categoriaMl: p.categoria, categoriaMlOrigen: "manual" } });
  return out;
}

export { describirCategoria };
