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
  pausaEntreEscrituras,
  type LecturaMl,
} from "@/lib/precios-ml";

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
  etiquetas: string[];
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
  /** La lectura de ML más vieja de las vigentes, para el "leído hace…". */
  leidoMl: string | null;
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
      const propuesto = p ? precioDeClave(p, canal, m.unidades, cx.general.gastos) : null;
      const lectura = (m.precioLectura as LecturaMl | null) ?? null;
      const mla = canal === "mercadolibre" ? m.clave.split("|")[0] : null;
      const muestra = (m.muestra ?? {}) as { titulo?: string };

      let motivo: string | null = null;
      if (!m.combinacionId) motivo = "falta mapear";
      else if (!m.combinacion?.activo) motivo = "la combinación está desactivada";
      else if (!p) motivo = "el producto está inactivo";
      else if (!p.precios) motivo = textoDeFalta(p.falta);
      else if (canal === "shop") motivo = "falta el endpoint de precios del Shop (spec 006)";
      else motivo = motivoMl(lectura, m.precioLeidoEn);

      const etiquetas: string[] = [];
      if (lectura?.estado === "paused") etiquetas.push("pausada");
      if (lectura?.catalogo) etiquetas.push("catálogo");
      if (lectura?.promo) etiquetas.push("en promoción");
      if (m.unidades > 1) etiquetas.push(`pack de ${m.unidades}`);

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
        ...diferencia(m.precioPublicado, propuesto),
        motivo,
        etiquetas,
      };
    });

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

  const lecturas = canales.filter((f) => f.canal === "mercadolibre" && f.leidoEn).map((f) => f.leidoEn!);
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
    leidoMl: lecturas.length ? lecturas.sort()[0] : null,
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
  if (canal === "shop") throw new ErrorDePrecios("la web se aplica con el endpoint del Shop, que todavía no está (spec 006)", 501);
  const propuesta = await armarPropuesta(tenantId);
  return canal === "erp"
    ? aplicarErp(tenantId, usuario, propuesta, filas, confirmadoGrandes)
    : aplicarMl(tenantId, usuario, propuesta, filas, confirmadoGrandes);
}

function revisar(
  f: { propuesto: number | null; pct: number | null; motivo: string | null } | undefined,
  precio: number,
  confirmadoGrandes: boolean
): string | null {
  if (!f) return "no está en la propuesta";
  if (f.motivo) return f.motivo;
  if (f.propuesto == null) return "sin precio propuesto";
  if (Math.abs(f.propuesto - precio) >= 1) return `la propuesta cambió a $${Math.round(f.propuesto)}: recargá la pantalla`;
  if (esGrande(f.pct) && !confirmadoGrandes) return `cambia más de ${CAMBIO_GRANDE_PCT} %: hay que confirmarlo aparte`;
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
