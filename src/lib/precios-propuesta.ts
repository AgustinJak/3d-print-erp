import { prisma } from "@/lib/prisma";
import {
  cargarContextoDePrecios,
  precioDeClave,
  preciosDeCombinaciones,
  precioDeVentaErp,
  type PrecioDeCombinacion,
} from "@/lib/precios-combinacion";
import { CAMBIO_GRANDE_PCT, conDiferencia, esGrande, textoDeFalta } from "@/lib/precios-reglas";
import {
  esErrorDeAutorizacion,
  escribirPrecioMl,
  motivoMl,
  avisoMl,
  pausaEntreEscrituras,
  type LecturaMl,
} from "@/lib/precios-ml";
import { llamarShop, motivoShop, opcionesDeClave, porClave, productoDeClave, type LecturaShop } from "@/lib/precios-shop";

/**
 * La pantalla de Precios (docs/sdd/003, spec 004): qué precio cambiaría en cada canal y aplicarlo.
 *
 * Nada sale solo. La propuesta se arma de cero en cada pedido y "aplicar" la vuelve a armar en el
 * servidor: si lo que aprobó Agustín ya no es lo que da la cuenta (cambió un costo en Bodega
 * mientras tanto), no se manda y se pide recargar.
 */

export type Canal = "mercadolibre" | "shop" | "erp";

export interface FilaDeCanal {
  canal: "mercadolibre" | "shop";
  clave: string;
  enlace: string | null;
  titulo: string | null;
  combinacionId: string | null;
  combinacion: string | null;
  modeloId: string | null;
  unidades: number;
  publicado: number | null;
  /** ML: lo que paga el cliente, con la promoción si hay. */
  paga: number | null;
  leidoEn: string | null;
  propuesto: number | null;
  diferencia: number | null;
  pct: number | null;
  /** Por qué no se puede aplicar; null = se puede. */
  motivo: string | null;
  /** Algo para saber antes de aplicar (una campaña), que no lo impide. */
  aviso: string | null;
  /** Por qué pide la confirmación aparte: cambia más de 30 % o ML sacaría la promoción. */
  aparte: string | null;
  etiquetas: string[];
  /**
   * Shop: el producto al que pertenece la clave. En la web se aplica el producto entero (todas sus
   * combinaciones juntas), porque el Shop guarda base + extras y no un precio por combinación.
   */
  producto: string | null;
  /** Shop: una combinación que el Shop no tiene en cuenta (opción inactiva); no frena al producto. */
  ignorada: boolean;
}

export interface FilaErp {
  modeloId: string;
  modelo: string;
  actual: number;
  propuesto: number | null;
  diferencia: number | null;
  pct: number | null;
  motivo: string | null;
  adicionales: Array<{ varianteId: string; nombre: string; actual: number; propuesto: number }>;
  /** Combinaciones donde base + adicionales no da su precio (productos con dos grupos). */
  desvios: number;
}

export interface Propuesta {
  gastos: { deBodega: boolean; redondeo: string; margen: number; promo: number };
  combinaciones: PrecioDeCombinacion[];
  canales: FilaDeCanal[];
  erp: FilaErp[];
  /** La lectura más vieja de cada canal, para el "leído hace…". */
  leidoMl: string | null;
  leidoShop: string | null;
}

const diferencia = (publicado: number | null, propuesto: number | null) =>
  publicado == null || propuesto == null
    ? { diferencia: null, pct: null }
    : { diferencia: propuesto - publicado, pct: publicado > 0 ? ((propuesto - publicado) / publicado) * 100 : null };

export async function armarPropuesta(tenantId: string): Promise<Propuesta> {
  const cx = await cargarContextoDePrecios(tenantId);
  const [combinaciones, mapeos, modelos] = await Promise.all([
    preciosDeCombinaciones(tenantId, {}, cx),
    prisma.mapeoCanal.findMany({
      where: { tenantId, ignorar: false },
      select: {
        canal: true,
        clave: true,
        unidades: true,
        descripcion: true,
        muestra: true,
        combinacionId: true,
        precioPublicado: true,
        precioLeidoEn: true,
        precioLectura: true,
        combinacion: { select: { nombre: true, modeloId: true, activo: true } },
      },
    }),
    prisma.modelo.findMany({
      where: { tenantId, activo: true, consolidadoEnId: null, esInsumo: false },
      select: { id: true, nombre: true, precioVenta: true, variantes: { select: { id: true, nombre: true, precioAdicional: true } } },
    }),
  ]);
  const porId = new Map(combinaciones.map((c) => [c.combinacionId, c]));

  const canales: FilaDeCanal[] = mapeos
    .filter((m) => m.canal === "mercadolibre" || m.canal === "shop")
    .map((m) => {
      const canal = m.canal as "mercadolibre" | "shop";
      const p = m.combinacionId ? porId.get(m.combinacionId) : undefined;
      // El Shop sólo acepta precios enteros.
      const crudo = p ? precioDeClave(p, canal, m.unidades, cx.general.gastos) : null;
      const propuesto = crudo != null && canal === "shop" ? Math.round(crudo) : crudo;
      const lectura = canal === "mercadolibre" ? ((m.precioLectura as LecturaMl | null) ?? null) : null;
      const lecturaShop = canal === "shop" ? ((m.precioLectura as LecturaShop | null) ?? null) : null;
      const mla = canal === "mercadolibre" ? m.clave.split("|")[0] : null;
      const muestra = (m.muestra ?? {}) as { titulo?: string };

      let motivo: string | null = null;
      if (!m.combinacionId) motivo = "falta mapear";
      else if (!m.combinacion?.activo) motivo = "la combinación está desactivada";
      else if (!p) motivo = "el producto está inactivo";
      else if (!p.precios) motivo = textoDeFalta(p.falta);
      else if (canal === "shop") motivo = motivoShop(lecturaShop, m.precioLeidoEn);
      else motivo = motivoMl(lectura, m.precioLeidoEn);

      const etiquetas: string[] = [];
      if (lectura?.estado === "paused") etiquetas.push("pausada");
      if (lectura?.catalogo) etiquetas.push("catálogo");
      if (lectura?.promo) etiquetas.push("en campaña");
      if (m.unidades > 1) etiquetas.push(`pack de ${m.unidades}`);
      if (lecturaShop?.ignorada) etiquetas.push("ignorada por el Shop");

      const dif = diferencia(m.precioPublicado, propuesto);
      const campana = canal === "mercadolibre" ? avisoMl(lectura, propuesto) : null;
      return {
        canal,
        clave: m.clave,
        enlace: mla ? `https://articulo.mercadolibre.com.ar/${mla.replace(/^MLA/, "MLA-")}` : null,
        titulo: muestra.titulo ?? m.descripcion ?? null,
        combinacionId: m.combinacionId,
        combinacion: m.combinacion?.nombre ?? null,
        modeloId: m.combinacion?.modeloId ?? null,
        unidades: m.unidades,
        publicado: m.precioPublicado,
        paga: lectura?.paga ?? null,
        leidoEn: m.precioLeidoEn?.toISOString() ?? null,
        propuesto,
        ...dif,
        motivo,
        aviso: campana?.aviso ?? null,
        aparte: campana?.sacaPromo ? "ML saca la promoción" : esGrande(dif.pct) ? `cambia más de ${CAMBIO_GRANDE_PCT} %` : null,
        etiquetas,
        producto: canal === "shop" ? productoDeClave(m.clave) : null,
        ignorada: !!lecturaShop?.ignorada,
      };
    });

  // En la web se aplica el producto entero: si una combinación no se puede, ninguna del producto.
  const porProducto = new Map<string, FilaDeCanal[]>();
  for (const f of canales.filter((f) => f.canal === "shop" && !f.ignorada)) porProducto.set(f.producto!, [...(porProducto.get(f.producto!) ?? []), f]);
  for (const filas of porProducto.values()) {
    const frena = filas.find((f) => f.motivo);
    if (!frena) continue;
    for (const f of filas) f.motivo ??= `otra combinación del producto no se puede aplicar (${frena.combinacion ?? frena.clave}: ${frena.motivo})`;
  }

  // Dos claves de la misma publicación con precios distintos: ML tiene un solo precio.
  const porMla = new Map<string, FilaDeCanal[]>();
  for (const f of canales.filter((f) => f.canal === "mercadolibre")) {
    const mla = f.clave.split("|")[0];
    porMla.set(mla, [...(porMla.get(mla) ?? []), f]);
  }
  for (const filas of porMla.values()) {
    if (new Set(filas.map((f) => f.propuesto)).size > 1) for (const f of filas) f.motivo ??= "precios distintos en la misma publicación";
  }

  const erp: FilaErp[] = modelos
    .filter((m) => combinaciones.some((c) => c.modeloId === m.id))
    .map((m) => {
      const r = precioDeVentaErp(m.id, combinaciones);
      const nombres = new Map(m.variantes.map((v) => [v.id, v]));
      const adicionales = r.adicionales
        .filter((a) => nombres.has(a.varianteId))
        .map((a) => ({ varianteId: a.varianteId, nombre: nombres.get(a.varianteId)!.nombre, actual: nombres.get(a.varianteId)!.precioAdicional, propuesto: a.precioAdicional }));
      const sinPrecio = combinaciones.filter((c) => c.modeloId === m.id && !c.precios);
      return {
        modeloId: m.id,
        modelo: m.nombre,
        actual: m.precioVenta,
        propuesto: r.precioVenta,
        ...diferencia(m.precioVenta, r.precioVenta),
        motivo: r.precioVenta == null ? textoDeFalta(sinPrecio.flatMap((c) => c.falta)) : null,
        adicionales,
        desvios: r.desvios.length,
      };
    });

  const masVieja = (canal: "mercadolibre" | "shop") => {
    const l = canales.filter((f) => f.canal === canal && f.leidoEn).map((f) => f.leidoEn!);
    return l.length ? l.sort()[0] : null;
  };
  return {
    gastos: {
      deBodega: cx.general.deBodega,
      redondeo: cx.general.redondeo,
      margen: cx.general.gastos.margenMinorista,
      promo: cx.general.gastos.mlPromoPct,
    },
    combinaciones,
    canales,
    erp,
    leidoMl: masVieja("mercadolibre"),
    leidoShop: masVieja("shop"),
  };
}

export function erpConDiferencia(f: FilaErp): boolean {
  return conDiferencia(f) || f.adicionales.some((a) => Math.abs(a.propuesto - a.actual) > 1);
}

export interface ResultadoFila {
  clave: string;
  estado: "aplicado" | "rechazado" | "error" | "sin_cambios";
  antes?: number | null;
  despues?: number | null;
  mensaje?: string;
}

export class ErrorDePrecios extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Aplica los precios aprobados en un canal (REQ-3). Cada fila trae el precio que vio Agustín: si
 * la propuesta de ahora da otro número, esa fila no se manda.
 */
export async function aplicarPrecios(
  tenantId: string,
  usuario: string | null,
  canal: Canal,
  filas: Array<{ clave: string; precio: number }>,
  confirmadoGrandes: boolean
): Promise<ResultadoFila[]> {
  const propuesta = await armarPropuesta(tenantId);
  if (canal === "erp") return aplicarErp(tenantId, usuario, propuesta, filas, confirmadoGrandes);
  if (canal === "shop") return aplicarShop(tenantId, usuario, propuesta, filas, confirmadoGrandes);
  return aplicarMl(tenantId, usuario, propuesta, filas, confirmadoGrandes);
}

function revisar(
  f: { propuesto: number | null; pct: number | null; motivo: string | null; aparte?: string | null } | undefined,
  precio: number,
  confirmadoGrandes: boolean
): string | null {
  if (!f) return "no está en la propuesta";
  if (f.motivo) return f.motivo;
  if (f.propuesto == null) return "sin precio propuesto";
  if (Math.abs(f.propuesto - precio) >= 1) return `la propuesta cambió a $${Math.round(f.propuesto)}: recargá la pantalla`;
  const aparte = f.aparte !== undefined ? f.aparte : esGrande(f.pct) ? `cambia más de ${CAMBIO_GRANDE_PCT} %` : null;
  if (aparte && !confirmadoGrandes) return `${aparte}: hay que confirmarlo aparte`;
  return null;
}

async function aplicarMl(
  tenantId: string,
  usuario: string | null,
  propuesta: Propuesta,
  filas: Array<{ clave: string; precio: number }>,
  confirmadoGrandes: boolean
): Promise<ResultadoFila[]> {
  const out: ResultadoFila[] = [];
  let cortar: string | null = null;
  let escritas = 0;
  for (const { clave, precio } of filas) {
    if (cortar) {
      out.push({ clave, estado: "rechazado", mensaje: `no se mandó: ${cortar}` });
      continue;
    }
    const f = propuesta.canales.find((x) => x.canal === "mercadolibre" && x.clave === clave);
    const motivo = revisar(f, precio, confirmadoGrandes);
    if (motivo) {
      out.push({ clave, estado: "rechazado", mensaje: motivo });
      continue;
    }
    // Doble click: si ya está publicado lo propuesto, no se manda nada.
    if (f!.publicado != null && Math.abs(f!.publicado - f!.propuesto!) < 1) {
      out.push({ clave, estado: "sin_cambios", antes: f!.publicado, despues: f!.publicado });
      continue;
    }

    if (escritas++) await pausaEntreEscrituras();
    const mla = clave.split("|")[0];
    try {
      const r = await escribirPrecioMl(tenantId, mla, f!.propuesto!);
      const estado = r.despues != null && Math.abs(r.despues - f!.propuesto!) < 1 ? "aplicado" : "error";
      await prisma.cambioPrecio.create({
        data: { tenantId, canal: "mercadolibre", clave, combinacionId: f!.combinacionId, antes: r.antes, despues: r.despues ?? f!.propuesto!, estado, respuesta: r as object, usuario },
      });
      await prisma.mapeoCanal.updateMany({
        where: { tenantId, canal: "mercadolibre", clave: { startsWith: `${mla}|` } },
        data: { precioPublicado: r.despues, precioLeidoEn: new Date() },
      });
      const avisos = [
        estado === "error" && "ML aceptó pero quedó otro precio",
        r.otrosCambios.length && `cambiaron otros campos: ${r.otrosCambios.join(", ")}`,
        r.envioGratis && `ML ${r.envioGratis.despues ? "puso" : "sacó"} el envío gratis (lo decide por el precio)`,
      ].filter(Boolean);
      out.push({ clave, estado, antes: r.antes, despues: r.despues, mensaje: avisos.length ? avisos.join(" · ") : undefined });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await prisma.cambioPrecio.create({
        data: { tenantId, canal: "mercadolibre", clave, combinacionId: f!.combinacionId, antes: f!.publicado, despues: f!.propuesto!, estado: "error", respuesta: { error: mensaje }, usuario },
      });
      out.push({ clave, estado: "error", mensaje });
      if (esErrorDeAutorizacion(e)) cortar = "ML rechazó la autorización";
    }
  }
  return out;
}

async function aplicarErp(
  tenantId: string,
  usuario: string | null,
  propuesta: Propuesta,
  filas: Array<{ clave: string; precio: number }>,
  confirmadoGrandes: boolean
): Promise<ResultadoFila[]> {
  const out: ResultadoFila[] = [];
  for (const { clave, precio } of filas) {
    const f = propuesta.erp.find((x) => x.modeloId === clave);
    const motivo = revisar(f, precio, confirmadoGrandes);
    if (motivo) {
      out.push({ clave, estado: "rechazado", mensaje: motivo });
      continue;
    }
    if (!erpConDiferencia(f!)) {
      out.push({ clave, estado: "sin_cambios", antes: f!.actual, despues: f!.actual });
      continue;
    }
    const cambian = f!.adicionales.filter((a) => Math.abs(a.propuesto - a.actual) > 1);
    await prisma.$transaction([
      prisma.modelo.update({ where: { id: clave }, data: { precioVenta: f!.propuesto! } }),
      ...cambian.map((a) => prisma.varianteModelo.update({ where: { id: a.varianteId }, data: { precioAdicional: a.propuesto } })),
      prisma.cambioPrecio.create({
        data: { tenantId, canal: "erp", clave, antes: f!.actual, despues: f!.propuesto!, estado: "aplicado", respuesta: { adicionales: cambian.length }, usuario },
      }),
      ...cambian.map((a) =>
        prisma.cambioPrecio.create({
          data: { tenantId, canal: "erp", clave: `variante:${a.varianteId}`, antes: a.actual, despues: a.propuesto, estado: "aplicado", respuesta: { modeloId: clave, opcion: a.nombre }, usuario },
        })
      ),
    ]);
    out.push({ clave, estado: "aplicado", antes: f!.actual, despues: f!.propuesto });
  }
  return out;
}

/**
 * La web, por producto entero (spec 006): cada producto con una fila elegida tiene que venir con
 * todas sus combinaciones (menos las que el Shop ignora), cada una con el precio propuesto de
 * ahora. Se manda todo junto y el Shop escribe cada producto entero o nada.
 */
async function aplicarShop(
  tenantId: string,
  usuario: string | null,
  propuesta: Propuesta,
  filas: Array<{ clave: string; precio: number }>,
  confirmadoGrandes: boolean
): Promise<ResultadoFila[]> {
  const out: ResultadoFila[] = [];
  const pedidas = new Map(filas.map((f) => [f.clave, f.precio]));
  const delShop = propuesta.canales.filter((f) => f.canal === "shop");
  const productos = [...new Set(filas.map((f) => productoDeClave(f.clave)))];

  const aMandar: Array<{ producto_id: string; filas: FilaDeCanal[] }> = [];
  for (const producto of productos) {
    const todas = delShop.filter((f) => f.producto === producto && !f.ignorada);
    const claves = todas.map((f) => f.clave);
    const rechazar = (mensaje: string) => {
      for (const clave of filas.map((f) => f.clave).filter((c) => productoDeClave(c) === producto)) out.push({ clave, estado: "rechazado", mensaje });
    };
    if (!todas.length) {
      rechazar("no está en la propuesta");
      continue;
    }
    const faltan = claves.filter((c) => !pedidas.has(c));
    if (faltan.length) {
      rechazar(`en la web se aplica el producto entero: faltan ${faltan.length} de sus ${claves.length} combinaciones`);
      continue;
    }
    const problema = todas.map((f) => ({ f, m: revisar(f, pedidas.get(f.clave)!, confirmadoGrandes) })).find((x) => x.m);
    if (problema) {
      rechazar(`${problema.f.combinacion ?? problema.f.clave}: ${problema.m}`);
      continue;
    }
    if (todas.every((f) => f.publicado != null && Math.abs(f.publicado - f.propuesto!) < 1)) {
      for (const f of todas) out.push({ clave: f.clave, estado: "sin_cambios", antes: f.publicado, despues: f.publicado });
      continue;
    }
    aMandar.push({ producto_id: producto, filas: todas });
  }
  if (!aMandar.length) return out;

  let resultados;
  try {
    resultados = await llamarShop(
      aMandar.map((p) => ({ producto_id: p.producto_id, combinaciones: p.filas.map((f) => ({ opcion_ids: opcionesDeClave(f.clave), precio: f.propuesto! })) })),
      false
    );
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    for (const p of aMandar) {
      for (const f of p.filas) {
        out.push({ clave: f.clave, estado: "error", mensaje });
        await prisma.cambioPrecio.create({
          data: { tenantId, canal: "shop", clave: f.clave, combinacionId: f.combinacionId, antes: f.publicado, despues: f.propuesto!, estado: "error", respuesta: { error: mensaje }, usuario },
        });
      }
    }
    return out;
  }

  const ahora = new Date();
  for (const p of aMandar) {
    const r = resultados.find((x) => x.producto_id === p.producto_id);
    const valores = r ? porClave(r) : new Map<string, { actual: number; nuevo: number }>();
    const aplicado = r?.estado === "ok";
    const mensaje = !r
      ? "el Shop no contestó por este producto"
      : r.estado === "sin_cambio"
        ? undefined
        : aplicado
          ? undefined
          : r.motivo?.startsWith("cambio_concurrente")
            ? "el producto cambió en el Shop mientras se aplicaba: volvé a leer"
            : `${r.estado}: ${r.motivo ?? ""}`.trim();
    for (const f of p.filas) {
      const v = valores.get(f.clave);
      if (r?.estado === "sin_cambio") {
        out.push({ clave: f.clave, estado: "sin_cambios", antes: v?.actual ?? f.publicado, despues: v?.actual ?? f.publicado });
        continue;
      }
      out.push({ clave: f.clave, estado: aplicado ? "aplicado" : "rechazado", antes: v?.actual ?? f.publicado, despues: aplicado ? (v?.nuevo ?? f.propuesto) : f.publicado, mensaje });
      await prisma.cambioPrecio.create({
        data: {
          tenantId,
          canal: "shop",
          clave: f.clave,
          combinacionId: f.combinacionId,
          antes: v?.actual ?? f.publicado,
          despues: v?.nuevo ?? f.propuesto!,
          estado: aplicado ? "aplicado" : "rechazado",
          respuesta: (r ? { producto_id: r.producto_id, estado: r.estado, motivo: r.motivo, cambios: r.cambios } : { error: mensaje }) as object,
          usuario,
        },
      });
      if (aplicado) {
        await prisma.mapeoCanal.updateMany({ where: { tenantId, canal: "shop", clave: f.clave }, data: { precioPublicado: v?.nuevo ?? f.propuesto, precioLeidoEn: ahora } });
      }
    }
  }
  return out;
}
