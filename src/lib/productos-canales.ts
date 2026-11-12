import { prisma } from "@/lib/prisma";
import type { LecturaMl } from "@/lib/precios-ml";
import type { CanalesDeModelo, CombinacionLista, RespuestaDeCanales } from "@/lib/productos-lista";

/**
 * Dónde está publicado cada producto y cómo está cada variante (docs/sdd/008): sus publicaciones de
 * ML (activas, pausadas) y de la web, las variantes sin publicar, el stock del ERP y lo vendido (30
 * días y siempre, sin cancelados). Las publicaciones de Shay no cuentan.
 *
 * El estado y la entrega de ML son los de la última lectura de precios: `leidoEn` dice de cuándo.
 */
export async function canalesDeModelos(tenantId: string): Promise<RespuestaDeCanales> {
  // Las otras cuentas de ML, para decir de cuál es cada publicación (docs/sdd/010).
  const nombreDeCuenta = new Map(
    (await prisma.cuentaMercadolibre.findMany({ where: { tenantId, principal: false }, select: { id: true, nombre: true, nickname: true } })).map((c) => [c.id, c.nombre ?? c.nickname ?? "otra cuenta"])
  );
  const [mapeos, combinaciones, mueven, filasDeStock, ventas] = await Promise.all([
    prisma.mapeoCanal.findMany({
      where: { tenantId, ignorar: false, combinacionId: { not: null }, canal: { in: ["mercadolibre", "shop"] } },
      select: { canal: true, clave: true, combinacionId: true, precioLectura: true, precioLeidoEn: true, cuentaMlId: true, combinacion: { select: { modeloId: true } } },
    }),
    prisma.combinacion.findMany({
      where: { tenantId, activo: true },
      select: { id: true, nombre: true, modeloId: true, variantes: true, modelo: { select: { nombre: true } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.varianteModelo.findMany({ where: { afectaStock: true, modelo: { tenantId } }, select: { id: true } }),
    prisma.stock.findMany({ where: { tenantId }, select: { clave: true, cantidad: true } }),
    prisma.$queryRaw<Array<{ id: string; modelo_id: string; total: number; d30: number }>>`
      SELECT c.id, c.modelo_id,
             sum(i.cantidad)::int AS total,
             coalesce(sum(i.cantidad) FILTER (WHERE p.fecha_pedido >= now() - interval '30 days'), 0)::int AS d30
      FROM items_pedido i
      JOIN pedidos p ON p.id = i.pedido_id
      JOIN combinaciones c ON c.id = i.combinacion_id
      WHERE p.tenant_id = ${tenantId} AND p.estado <> 'CANCELADO'
      GROUP BY c.id, c.modelo_id
    `,
  ]);

  const modelos: Record<string, CanalesDeModelo> = {};
  const de = (id: string) =>
    (modelos[id] ??= { ml: { activas: 0, pausadas: 0, otras: 0 }, mlas: [], entrega: { flex: 0, aPedido: 0 }, web: 0, sinMl: [], combinaciones: [], stock: null, vendidas30: 0, vendidas: 0 });

  // La fila de stock de una combinación se identifica con las variantes que mueven stock.
  const mueve = new Set(mueven.map((v) => v.id));
  const stockDe = new Map(filasDeStock.map((s) => [s.clave, s.cantidad]));
  const vendidasDe = new Map(ventas.map((v) => [v.id, v]));
  const porId = new Map<string, CombinacionLista>();
  const filasDelModelo = new Map<string, Set<string>>();
  for (const c of combinaciones) {
    const clave = `${c.modeloId}|${c.variantes.filter((v) => mueve.has(v)).sort().join(",")}`;
    const stock = stockDe.get(clave) ?? null;
    const v = vendidasDe.get(c.id);
    const prefijo = `${c.modelo.nombre} · `;
    const comb: CombinacionLista = {
      id: c.id,
      nombre: c.nombre,
      corto: c.nombre.startsWith(prefijo) ? c.nombre.slice(prefijo.length) : c.nombre === c.modelo.nombre ? "Única" : c.nombre,
      stock,
      vendidas30: v?.d30 ?? 0,
      vendidas: v?.total ?? 0,
      publicaciones: [],
      web: false,
    };
    porId.set(c.id, comb);
    const m = de(c.modeloId);
    m.combinaciones.push(comb);
    // Dos combinaciones pueden compartir la fila (Con Funda y Sin Funda): se suma una vez.
    if (stock != null) {
      const vistas = filasDelModelo.get(c.modeloId) ?? new Set<string>();
      if (!vistas.has(clave)) m.stock = (m.stock ?? 0) + stock;
      filasDelModelo.set(c.modeloId, vistas.add(clave));
    }
  }
  // Lo vendido del producto cuenta también las variantes que hoy están inactivas.
  for (const v of ventas) {
    const m = de(v.modelo_id);
    m.vendidas += v.total;
    m.vendidas30 += v.d30;
  }

  let leidoEn: Date | null = null;
  const vistas = new Set<string>();
  for (const m of mapeos) {
    if (!m.combinacion) continue;
    const c = de(m.combinacion.modeloId);
    const comb = porId.get(m.combinacionId!);
    if (m.canal === "shop") {
      c.web++;
      if (comb) comb.web = true;
      continue;
    }
    // Una publicación con variaciones tiene una clave por variación: se cuenta una vez.
    const mla = m.clave.split("|")[0];
    const lectura = m.precioLectura as unknown as LecturaMl | null;
    const estado = lectura?.estado === "active" ? "active" : lectura?.estado === "paused" ? "paused" : "otro";
    if (comb && !comb.publicaciones.some((x) => x.mla === mla)) {
      comb.publicaciones.push({ mla, estado, flex: !!lectura?.flex, dias: lectura?.disponibilidad ?? null, premium: lectura?.tipo === "gold_pro", cuenta: m.cuentaMlId ? (nombreDeCuenta.get(m.cuentaMlId) ?? "otra cuenta") : null });
    }
    if (vistas.has(`${m.combinacion.modeloId}|${mla}`)) continue;
    vistas.add(`${m.combinacion.modeloId}|${mla}`);
    if (m.precioLeidoEn && (!leidoEn || m.precioLeidoEn < leidoEn)) leidoEn = m.precioLeidoEn;
    if (estado === "active") c.ml.activas++;
    else if (estado === "paused") c.ml.pausadas++;
    else c.ml.otras++;
    if (estado !== "otro") c.mlas.push(mla);
    if (lectura?.flex) c.entrega.flex++;
    if (lectura?.disponibilidad) c.entrega.aPedido++;
  }
  const conMl = new Set(mapeos.filter((m) => m.canal === "mercadolibre").map((m) => m.combinacionId!));
  for (const c of combinaciones) if (!conMl.has(c.id)) de(c.modeloId).sinMl.push({ id: c.id, nombre: c.nombre });

  const respuesta: RespuestaDeCanales = { leidoEn: leidoEn?.toISOString() ?? null, modelos };
  return respuesta;
}
