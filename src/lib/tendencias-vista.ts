import { prisma } from "@/lib/prisma";
import { proximasFechasComerciales } from "@/lib/fechas-comerciales";
import {
  CATEGORIA_SITIO,
  esGenerica,
  hoyEnArgentina,
  leerTema,
  normalizar,
  temaDeTexto,
  type BusquedaDeTema,
  type EventoDeTema,
  type Lectura,
  type TipoDeTema,
} from "@/lib/temas";

/**
 * Lo que muestra /tendencias (docs/sdd/016, spec 004): los temas con sus señales, las búsquedas
 * nuevas de ML y el calendario de los próximos 6 meses. Pocas consultas y el resto en memoria.
 */

const TENANT = "sendero3d";
const DIA = 24 * 60 * 60 * 1000;
/** En "Búsquedas nuevas", sólo las primeras de cada categoría: el resto es ruido. */
const POSICION_MAXIMA_NUEVAS = 15;

export interface EventoEnVista extends EventoDeTema {
  id: string | null;
  temaId: string | null;
  temaNombre: string | null;
  imagenUrl: string | null;
  /** Fecha comercial calculada (no es una fila). */
  comercial: boolean;
  fuente: string;
  descripcion: string | null;
}

export interface TemaEnLista {
  id: string;
  nombre: string;
  tipo: TipoDeTema;
  alias: string[];
  activo: boolean;
  productos: number;
  foto: string | null;
  ventas: { ultimos30: number; anteriores30: number };
  busquedas: BusquedaDeTema[];
  eventos: EventoEnVista[];
  lectura: Lectura;
}

export interface BusquedaNueva extends BusquedaDeTema {
  normalizada: string;
  /** tuya = una categoría donde tenés productos; raiz = la principal de una de esas; sitio = todo ML. */
  ambito: "tuya" | "raiz" | "sitio";
}

export interface VistaDeTendencias {
  temas: TemaEnLista[];
  nuevas: BusquedaNueva[];
  calendario: EventoEnVista[];
  /** El día de la última foto de ML, AAAA-MM-DD. */
  fotoMl: string | null;
  sync: { hora: string; resumen: Record<string, unknown> } | null;
}

interface ProductoDeTema {
  id: string;
  nombre: string;
  serie: string | null;
  foto: string | null;
  activo: boolean;
  ultimos30: number;
  anteriores30: number;
}

/** Los productos (no insumos) con su serie normalizada y sus ventas de 30 días y de los 30 anteriores. */
export async function productosConVentas(): Promise<ProductoDeTema[]> {
  const [modelos, ventas] = await Promise.all([
    prisma.modelo.findMany({
      where: { tenantId: TENANT, esInsumo: false, serie: { not: null } },
      select: { id: true, nombre: true, serie: true, activo: true, imagenUrl: true, imagenesUrls: true },
    }),
    prisma.$queryRaw<Array<{ modelo_id: string; u30: bigint | null; prev: bigint | null }>>`
      SELECT i.modelo_id,
             sum(i.cantidad) FILTER (WHERE p.fecha_pedido >= now() - interval '30 days') AS u30,
             sum(i.cantidad) FILTER (WHERE p.fecha_pedido < now() - interval '30 days') AS prev
        FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
       WHERE p.tenant_id = ${TENANT} AND p.estado <> 'CANCELADO' AND p.fecha_pedido >= now() - interval '60 days'
         AND i.modelo_id IS NOT NULL
       GROUP BY i.modelo_id`,
  ]);
  const porModelo = new Map(ventas.map((v) => [v.modelo_id, v]));
  return modelos.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    serie: m.serie,
    foto: m.imagenesUrls?.[0] ?? m.imagenUrl ?? null,
    activo: m.activo,
    ultimos30: Number(porModelo.get(m.id)?.u30 ?? 0),
    anteriores30: Number(porModelo.get(m.id)?.prev ?? 0),
  }));
}

/** Un producto es del tema si su serie normalizada es uno de los alias (RN-3). */
export function productosDelTema(alias: string[], productos: ProductoDeTema[]): ProductoDeTema[] {
  const a = new Set(alias);
  return productos.filter((p) => p.serie && a.has(normalizar(p.serie)));
}

/**
 * La foto de ML de los últimos días: la del día más reciente, y "nueva" si no estaba en la de hace
 * 7 días o más (si todavía no hay una tan vieja, ninguna es nueva).
 */
export async function busquedasRecientes(): Promise<{ dia: string | null; filas: Array<BusquedaDeTema & { normalizada: string }> }> {
  const [ultima] = await prisma.$queryRaw<Array<{ dia: Date | null }>>`SELECT max(dia) AS dia FROM public.busquedas_ml WHERE tenant_id = ${TENANT}`;
  if (!ultima?.dia) return { dia: null, filas: [] };
  const dia = ultima.dia;
  const [vieja] = await prisma.$queryRaw<Array<{ dia: Date | null }>>`
    SELECT max(dia) AS dia FROM public.busquedas_ml WHERE tenant_id = ${TENANT} AND dia <= ${new Date(dia.getTime() - 7 * DIA)}`;
  const [hoy, antes] = await Promise.all([
    prisma.busquedaMl.findMany({ where: { tenantId: TENANT, dia }, select: { categoriaId: true, categoria: true, palabra: true, normalizada: true, posicion: true } }),
    vieja?.dia ? prisma.busquedaMl.findMany({ where: { tenantId: TENANT, dia: vieja.dia }, select: { categoriaId: true, normalizada: true } }) : Promise.resolve([]),
  ]);
  const estaban = new Set(antes.map((b) => `${b.categoriaId}|${b.normalizada}`));
  return {
    dia: dia.toISOString().slice(0, 10),
    filas: hoy.map((b) => ({ ...b, nueva: !!vieja?.dia && !estaban.has(`${b.categoriaId}|${b.normalizada}`) })),
  };
}

/** Eventos no archivados de los próximos `dias`, más las fechas comerciales calculadas. */
export async function calendarioProximo(dias: number, temas: Array<{ id: string; nombre: string }>): Promise<EventoEnVista[]> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 7 * DIA);
  const hasta = new Date(ahora.getTime() + dias * DIA);
  const filas = await prisma.eventoTendencia.findMany({
    where: {
      tenantId: TENANT,
      archivado: false,
      activo: true,
      OR: [{ fechaAr: { gte: desde, lte: hasta } }, { fechaAr: null, fecha: { gte: desde, lte: hasta } }, { anual: true }],
    },
    select: { id: true, titulo: true, tipo: true, fecha: true, fechaAr: true, anual: true, imagenUrl: true, temaId: true, fuente: true, descripcion: true },
  });
  const nombre = new Map(temas.map((t) => [t.id, t.nombre]));
  const out: EventoEnVista[] = filas.map((f) => {
    let fecha = f.fechaAr ?? f.fecha;
    if (f.anual) {
      // La próxima ocurrencia del mismo día y mes.
      const [y] = hoyEnArgentina(ahora).split("-").map(Number);
      const este = new Date(Date.UTC(y, fecha.getUTCMonth(), fecha.getUTCDate()));
      fecha = este.getTime() >= Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()) ? este : new Date(Date.UTC(y + 1, fecha.getUTCMonth(), fecha.getUTCDate()));
    }
    return {
      id: f.id,
      titulo: f.titulo,
      tipo: f.tipo,
      fecha: fecha.toISOString(),
      enArgentina: !!f.fechaAr || f.fuente === "manual" || f.tipo === "concierto",
      temaId: f.temaId,
      temaNombre: f.temaId ? (nombre.get(f.temaId) ?? null) : null,
      imagenUrl: f.imagenUrl,
      comercial: false,
      fuente: f.fuente,
      descripcion: f.descripcion,
    };
  });
  for (const c of proximasFechasComerciales(ahora, dias)) {
    out.push({
      id: null,
      titulo: c.titulo,
      tipo: "fecha_comercial",
      fecha: c.fecha.toISOString(),
      enArgentina: true,
      temaId: null,
      temaNombre: null,
      imagenUrl: null,
      comercial: true,
      fuente: "calendario",
      descripcion: `Conviene tener el producto listo ${c.anticipacion} días antes.`,
    });
  }
  return out.filter((e) => new Date(e.fecha).getTime() <= hasta.getTime()).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function armarVista(): Promise<VistaDeTendencias> {
  const [temas, productos, busquedas, descartadas, [sync], categoriasTuyas] = await Promise.all([
    prisma.tema.findMany({ where: { tenantId: TENANT }, orderBy: { nombre: "asc" } }),
    productosConVentas(),
    busquedasRecientes(),
    prisma.busquedaDescartada.findMany({ where: { tenantId: TENANT }, select: { normalizada: true } }),
    prisma.$queryRaw<Array<{ v: { hora: string; resumen: Record<string, unknown> } | null }>>`
      SELECT data->'tendencias_sync' AS v FROM public.config_tenant WHERE tenant_id = ${TENANT}`,
    prisma.modelo.findMany({ where: { tenantId: TENANT, activo: true, esInsumo: false, categoriaMl: { not: null } }, select: { categoriaMl: true }, distinct: ["categoriaMl"] }),
  ]);
  const tuyas = new Set(categoriasTuyas.map((c) => c.categoriaMl!));
  const calendario = await calendarioProximo(183, temas);
  const activos = temas.filter((t) => t.activo);

  // Cada búsqueda va al tema de alias más largo que coincide.
  const busquedasDe = new Map<string, BusquedaDeTema[]>();
  const sueltas: Array<BusquedaDeTema & { normalizada: string }> = [];
  for (const b of busquedas.filas) {
    const t = temaDeTexto(b.palabra, activos);
    if (t) busquedasDe.set(t.id, [...(busquedasDe.get(t.id) ?? []), b]);
    else sueltas.push(b);
  }

  const lista: TemaEnLista[] = temas.map((t) => {
    const prods = productosDelTema(t.alias, productos);
    const activosDelTema = prods.filter((p) => p.activo);
    const ventas = { ultimos30: prods.reduce((n, p) => n + p.ultimos30, 0), anteriores30: prods.reduce((n, p) => n + p.anteriores30, 0) };
    const masVendido = [...prods].sort((a, b) => b.ultimos30 - a.ultimos30 || Number(!!b.foto) - Number(!!a.foto))[0];
    const bs = (busquedasDe.get(t.id) ?? []).sort((a, b) => a.posicion / (a.categoriaId === CATEGORIA_SITIO ? 0.5 : 1) - b.posicion / (b.categoriaId === CATEGORIA_SITIO ? 0.5 : 1));
    const eventos = calendario.filter((e) => e.temaId === t.id);
    return {
      id: t.id,
      nombre: t.nombre,
      tipo: t.tipo as TipoDeTema,
      alias: t.alias,
      activo: t.activo,
      productos: activosDelTema.length,
      foto: masVendido?.foto ?? prods.find((p) => p.foto)?.foto ?? null,
      ventas,
      busquedas: bs,
      eventos,
      lectura: leerTema({ busquedas: bs, eventos, ventas, productos: activosDelTema.length }),
    };
  });
  lista.sort((a, b) => Number(b.activo) - Number(a.activo) || b.lectura.puntaje - a.lectura.puntaje || b.ventas.ultimos30 - a.ventas.ultimos30 || a.nombre.localeCompare(b.nombre));

  // Búsquedas nuevas: sin tema, no genéricas, no descartadas, entre las primeras de su categoría.
  const fuera = new Set(descartadas.map((d) => d.normalizada));
  const mejores = new Map<string, BusquedaNueva>();
  for (const b of sueltas) {
    if (b.posicion > POSICION_MAXIMA_NUEVAS || esGenerica(b.normalizada) || fuera.has(b.normalizada)) continue;
    const peso = (x: BusquedaNueva) => x.posicion / (x.categoriaId === CATEGORIA_SITIO ? 0.5 : 1);
    const nueva: BusquedaNueva = { ...b, ambito: b.categoriaId === CATEGORIA_SITIO ? "sitio" : tuyas.has(b.categoriaId) ? "tuya" : "raiz" };
    const ya = mejores.get(b.normalizada);
    if (!ya || peso(nueva) < peso(ya)) mejores.set(b.normalizada, nueva);
  }
  const orden = { tuya: 0, raiz: 1, sitio: 2 } as const;
  const nuevas = [...mejores.values()].sort((a, b) => orden[a.ambito] - orden[b.ambito] || Number(b.nueva) - Number(a.nueva) || a.posicion - b.posicion);

  return { temas: lista, nuevas, calendario, fotoMl: busquedas.dia, sync: sync?.v ?? null };
}
