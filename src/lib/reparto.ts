import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import { enviosParaDespachar } from "@/lib/envios-para-despachar";
import { hoyEnArgentina } from "@/lib/temas";
import { zonaDe, zonasActivas, type ZonaParaResolver } from "@/lib/zonas-reparto";

/**
 * El repartidor (docs/sdd/018): la hoja del día, el link, lo que él marca y la liquidación de los
 * lunes. Las direcciones no se guardan acá (RN-4): la de un Flex se lee de ML al abrir el link, y la
 * de la web sale del pedido.
 */

const TENANT = "sendero3d";
const HORAS_LINK = 48;
const DIA_MS = 24 * 60 * 60 * 1000;
export const ESTADOS_REPARTIDOR = ["ofrecido", "tomado", "rechazado", "entregado", "no_entregado"] as const;
export type EstadoReparto = (typeof ESTADOS_REPARTIDOR)[number];

const fechaDia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const hashDe = (token: string) => createHash("sha256").update(token).digest("hex");

interface MlDireccion {
  receiver_address?: {
    address_line?: string | null;
    street_name?: string | null;
    street_number?: string | null;
    comment?: string | null;
    zip_code?: string | null;
    city?: { name?: string | null } | null;
    state?: { name?: string | null } | null;
    neighborhood?: { name?: string | null } | null;
    receiver_name?: string | null;
    receiver_phone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
}

interface DireccionWeb {
  calle?: string;
  numero?: string;
  piso?: string;
  depto?: string;
  ciudad?: string;
  provincia?: string;
  cp?: string;
  notas?: string;
}

// ─── El día ─────────────────────────────────────────────────────────────

export interface Candidato {
  pedidoId: string;
  origen: "flex" | "web";
  /** El número para reconocerlo: la venta de ML o el pedido de la web. */
  numero: string;
  envioMl: string | null;
  /** ISO, con hora si viene de ML. */
  hasta: string | null;
  conHora: boolean;
  productos: Array<{ nombre: string; cantidad: number }>;
  localidad: string | null;
  zona: { id: string; nombre: string; precio: number } | null;
  /** Lo que ya tiene en la hoja de hoy, si se le ofreció. */
  enHoja: { id: string; estado: EstadoReparto; precio: number | null; zonaNombre: string | null; marcadoEn: string | null } | null;
  /** Lo que entra por ese envío: la bonificación Flex (si ya llegó) o lo que cobró la web. */
  ingreso: number | null;
}

export interface Dia {
  dia: string;
  candidatos: Candidato[];
  zonas: Array<{ id: string; nombre: string; precio: number }>;
  hoja: { id: string; enviadaEn: string | null; vence: string | null } | null;
}

function zonaCorta(z: ZonaParaResolver | null) {
  return z ? { id: z.id, nombre: z.nombre, precio: z.precio } : null;
}

/** Los Flex de hoy (y atrasados) y la mensajería de la web pendiente, con su zona. */
export async function armarDia(): Promise<Dia> {
  const dia = hoyEnArgentina();
  const zonas = await zonasActivas();
  const [{ envios }, web, hoja] = await Promise.all([
    enviosParaDespachar(),
    prisma.pedido.findMany({
      where: { tenantId: TENANT, canalVenta: "shop", metodoEnvio: "syb", estado: { in: ["CONFIRMADO", "EN_PRODUCCION", "TERMINADO"] } },
      select: {
        id: true,
        fechaEntrega: true,
        precioEnvio: true,
        origenExterno: true,
        cliente: { select: { direccion: true } },
        items: { select: { cantidad: true, descripcion: true, modelo: { select: { nombre: true } }, combinacion: { select: { nombre: true } } } },
      },
    }),
    prisma.hojaReparto.findUnique({ where: { tenantId_dia: { tenantId: TENANT, dia: fechaDia(dia) } }, include: { envios: true } }),
  ]);
  const enHoja = new Map((hoja?.envios ?? []).map((e) => [e.pedidoId, e]));

  // Flex de hoy o atrasados, que no estén en fabricación.
  const flex = envios.filter((e) => e.flex && e.envioId && e.despacho && e.despacho.slice(0, 10) <= dia && e.estado !== "en_fabricacion");
  const bonif = await prisma.flexMl.findMany({ where: { tenantId: TENANT, envioId: { in: flex.map((f) => f.envioId!) } }, select: { envioId: true, monto: true } });
  const bonifDe = new Map(bonif.map((b) => [b.envioId, b.monto]));

  const candidatos: Candidato[] = [];
  for (const e of flex) {
    let localidad: string | null = null;
    let zona: ZonaParaResolver | null = null;
    try {
      const s = await mlFetch<MlDireccion>(TENANT, `/shipments/${e.envioId}`);
      const a = s.receiver_address ?? {};
      localidad = a.city?.name ?? a.neighborhood?.name ?? null;
      zona = await zonaDe({ provincia: a.state?.name, localidad, cp: a.zip_code }, zonas);
    } catch {
      /* sin zona: se elige a mano */
    }
    const h = enHoja.get(e.pedidoId);
    candidatos.push({
      pedidoId: e.pedidoId,
      origen: "flex",
      numero: e.venta,
      envioMl: e.envioId,
      hasta: e.despacho,
      conHora: e.conHora,
      productos: e.productos,
      localidad,
      zona: zonaCorta(zona),
      enHoja: h ? { id: h.id, estado: h.estado as EstadoReparto, precio: h.precio == null ? null : Number(h.precio), zonaNombre: h.zonaNombre, marcadoEn: h.marcadoEn?.toISOString() ?? null } : null,
      ingreso: bonifDe.get(e.envioId!) ?? null,
    });
  }

  for (const p of web) {
    const oe = (p.origenExterno ?? {}) as { direccion_envio?: DireccionWeb; numero_pedido?: string };
    const d = oe.direccion_envio;
    // Pedidos de antes del 2026-11-23: la dirección está sólo en el cliente, como texto.
    const texto = p.cliente?.direccion ?? "";
    const zona = d
      ? await zonaDe({ provincia: d.provincia, localidad: d.ciudad, cp: d.cp }, zonas)
      : await zonaDe({ provincia: /caba|capital/i.test(texto) ? "CABA" : null, localidad: null, cp: /\b[A-Z]?(\d{4})\b/.exec(texto)?.[1] ?? null }, zonas);
    const h = enHoja.get(p.id);
    candidatos.push({
      pedidoId: p.id,
      origen: "web",
      numero: oe.numero_pedido ?? p.id.slice(-6),
      envioMl: null,
      hasta: p.fechaEntrega?.toISOString() ?? null,
      conHora: false,
      productos: p.items.map((i) => ({ nombre: i.combinacion?.nombre ?? i.modelo?.nombre ?? i.descripcion ?? "Producto", cantidad: i.cantidad })),
      localidad: d?.ciudad ?? null,
      zona: zonaCorta(zona),
      enHoja: h ? { id: h.id, estado: h.estado as EstadoReparto, precio: h.precio == null ? null : Number(h.precio), zonaNombre: h.zonaNombre, marcadoEn: h.marcadoEn?.toISOString() ?? null } : null,
      ingreso: p.precioEnvio || null,
    });
  }

  // Lo que se ofreció hoy y ya no está pendiente (se entregó, se canceló) también se ve.
  for (const e of hoja?.envios ?? []) {
    if (candidatos.some((c) => c.pedidoId === e.pedidoId)) continue;
    const p = await prisma.pedido.findUnique({
      where: { id: e.pedidoId },
      select: { idMercadolibre: true, origenExterno: true, items: { select: { cantidad: true, descripcion: true, modelo: { select: { nombre: true } }, combinacion: { select: { nombre: true } } } } },
    });
    candidatos.push({
      pedidoId: e.pedidoId,
      origen: e.origen as "flex" | "web",
      numero: (p?.origenExterno as { numero_pedido?: string; pack_id?: string } | null)?.numero_pedido ?? (p?.origenExterno as { pack_id?: string } | null)?.pack_id ?? p?.idMercadolibre ?? e.pedidoId.slice(-6),
      envioMl: e.envioMl,
      hasta: null,
      conHora: false,
      productos: (p?.items ?? []).map((i) => ({ nombre: i.combinacion?.nombre ?? i.modelo?.nombre ?? i.descripcion ?? "Producto", cantidad: i.cantidad })),
      localidad: null,
      zona: e.zonaId ? { id: e.zonaId, nombre: e.zonaNombre ?? "", precio: Number(e.precio ?? 0) } : null,
      enHoja: { id: e.id, estado: e.estado as EstadoReparto, precio: e.precio == null ? null : Number(e.precio), zonaNombre: e.zonaNombre, marcadoEn: e.marcadoEn?.toISOString() ?? null },
      ingreso: null,
    });
  }

  candidatos.sort((a, b) => (a.zona?.precio ?? 99999) - (b.zona?.precio ?? 99999) || a.origen.localeCompare(b.origen));
  return {
    dia,
    candidatos,
    zonas: zonas.map((z) => ({ id: z.id, nombre: z.nombre, precio: z.precio })),
    hoja: hoja ? { id: hoja.id, enviadaEn: hoja.enviadoEn?.toISOString() ?? null, vence: hoja.vence?.toISOString() ?? null } : null,
  };
}

// ─── Mandar la hoja ─────────────────────────────────────────────────────

export interface Elegido {
  pedidoId: string;
  origen: "flex" | "web";
  envioMl?: string | null;
  zonaId?: string | null;
}

/**
 * Guarda la hoja de hoy con los envíos elegidos y genera un link nuevo (el anterior deja de andar:
 * sólo se guarda el hash). Los que estaban ofrecidos y se destildaron, se sacan; los que el
 * repartidor ya marcó, quedan.
 */
export async function mandarHoja(elegidos: Elegido[]): Promise<{ ok: true; token: string; vence: string; envios: number } | { error: string }> {
  if (!elegidos.length) return { error: "Elegí al menos un envío" };
  const dia = hoyEnArgentina();
  const zonas = await zonasActivas();
  const precioDe = new Map(zonas.map((z) => [z.id, z]));
  const pedidos = await prisma.pedido.findMany({ where: { tenantId: TENANT, id: { in: elegidos.map((e) => e.pedidoId) } }, select: { id: true } });
  if (pedidos.length !== new Set(elegidos.map((e) => e.pedidoId)).size) return { error: "Hay envíos que no son de este negocio" };

  const token = randomBytes(32).toString("base64url");
  const vence = new Date(Date.now() + HORAS_LINK * 60 * 60 * 1000);
  const hoja = await prisma.hojaReparto.upsert({
    where: { tenantId_dia: { tenantId: TENANT, dia: fechaDia(dia) } },
    create: { dia: fechaDia(dia), tokenHash: hashDe(token), vence, enviadoEn: new Date() },
    update: { tokenHash: hashDe(token), vence, enviadoEn: new Date() },
  });

  const ids = new Set(elegidos.map((e) => e.pedidoId));
  await prisma.envioReparto.deleteMany({ where: { hojaId: hoja.id, estado: "ofrecido", pedidoId: { notIn: [...ids] } } });
  for (const e of elegidos) {
    const z = e.zonaId ? precioDe.get(e.zonaId) : null;
    await prisma.envioReparto.upsert({
      where: { hojaId_pedidoId: { hojaId: hoja.id, pedidoId: e.pedidoId } },
      create: { hojaId: hoja.id, pedidoId: e.pedidoId, origen: e.origen, envioMl: e.envioMl ?? null, zonaId: z?.id ?? null, zonaNombre: z?.nombre ?? null, precio: z?.precio ?? null },
      // Si todavía no lo marcó, la zona y el precio se pueden corregir.
      update: z ? { zonaId: z.id, zonaNombre: z.nombre, precio: z.precio } : {},
    });
  }
  return { ok: true, token, vence: vence.toISOString(), envios: elegidos.length };
}

/** Corregir zona o precio de un envío ya ofrecido, o sacarlo de la hoja. */
export async function editarEnvio(id: string, c: { zonaId?: unknown; precio?: unknown; quitar?: unknown }): Promise<{ ok: true } | { error: string }> {
  const e = await prisma.envioReparto.findFirst({ where: { id, tenantId: TENANT } });
  if (!e) return { error: "No existe ese envío" };
  if (e.liquidacionId) return { error: "Ese envío ya se pagó" };
  if (c.quitar === true) {
    if (e.estado === "entregado") return { error: "Ya se entregó: no se puede sacar" };
    await prisma.envioReparto.delete({ where: { id } });
    return { ok: true };
  }
  const data: { zonaId?: string; zonaNombre?: string; precio?: number } = {};
  if (typeof c.zonaId === "string") {
    const z = await prisma.zonaReparto.findFirst({ where: { id: c.zonaId, tenantId: TENANT } });
    if (!z) return { error: "Esa zona no existe" };
    Object.assign(data, { zonaId: z.id, zonaNombre: z.nombre, precio: Number(z.precio) });
  }
  if (c.precio !== undefined) {
    const n = Number(c.precio);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { error: "El precio no es válido" };
    data.precio = n;
  }
  if (!Object.keys(data).length) return { error: "No hay nada para cambiar" };
  await prisma.envioReparto.update({ where: { id }, data });
  return { ok: true };
}

// ─── Lo que ve el repartidor (link público) ─────────────────────────────

export interface EnvioDelRepartidor {
  id: string;
  origen: "flex" | "web";
  estado: EstadoReparto;
  motivo: string | null;
  zona: string | null;
  precio: number | null;
  nombre: string | null;
  direccion: string | null;
  detalle: string | null;
  localidad: string | null;
  telefono: string | null;
  mapa: string | null;
  hasta: string | null;
  productos: Array<{ nombre: string; cantidad: number }>;
}

export interface HojaDelRepartidor {
  dia: string;
  vence: string;
  envios: EnvioDelRepartidor[];
  semana: { entregados: number; total: number };
}

async function hojaValida(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const hoja = await prisma.hojaReparto.findUnique({ where: { tokenHash: hashDe(token) } });
  if (!hoja || !hoja.vence || hoja.vence.getTime() < Date.now() || hoja.tenantId !== TENANT) return null;
  return hoja;
}

const mapaDe = (dir: string, localidad: string | null) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([dir, localidad, "Buenos Aires"].filter(Boolean).join(", "))}`;

/** Lunes de la semana (hora argentina) de un día AAAA-MM-DD. */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return new Date(d.getTime() - dow * DIA_MS).toISOString().slice(0, 10);
}

export async function hojaDelRepartidor(token: string): Promise<HojaDelRepartidor | null> {
  const hoja = await hojaValida(token);
  if (!hoja) return null;
  const filas = await prisma.envioReparto.findMany({
    where: { hojaId: hoja.id },
    include: {
      pedido: {
        select: {
          fechaEntrega: true,
          origenExterno: true,
          cliente: { select: { nombre: true, telefono: true, direccion: true } },
          items: { select: { cantidad: true, descripcion: true, modelo: { select: { nombre: true } }, combinacion: { select: { nombre: true } } } },
        },
      },
    },
    orderBy: [{ precio: "asc" }, { creadoEn: "asc" }],
  });

  const envios: EnvioDelRepartidor[] = [];
  for (const f of filas) {
    const productos = f.pedido.items.map((i) => ({ nombre: i.combinacion?.nombre ?? i.modelo?.nombre ?? i.descripcion ?? "Producto", cantidad: i.cantidad }));
    let nombre: string | null = null;
    let direccion: string | null = null;
    let detalle: string | null = null;
    let localidad: string | null = null;
    let telefono: string | null = null;
    let coordenadas: string | null = null;
    let hasta: string | null = f.pedido.fechaEntrega?.toISOString() ?? null;
    if (f.origen === "flex" && f.envioMl) {
      // De ML en el momento, sin guardarla (RN-4).
      try {
        const [s, sla] = await Promise.all([
          mlFetch<MlDireccion>(TENANT, `/shipments/${f.envioMl}`),
          mlFetch<{ expected_date?: string | null }>(TENANT, `/shipments/${f.envioMl}/sla`).catch(() => null),
        ]);
        const a = s.receiver_address ?? {};
        nombre = a.receiver_name ?? null;
        direccion = a.address_line ?? ([a.street_name, a.street_number].filter(Boolean).join(" ") || null);
        detalle = a.comment ?? null;
        localidad = a.city?.name ?? a.neighborhood?.name ?? null;
        telefono = a.receiver_phone && /\d{6,}/.test(a.receiver_phone) ? a.receiver_phone : null;
        // ML trae el punto exacto: Maps va derecho ahí.
        if (typeof a.latitude === "number" && typeof a.longitude === "number") coordenadas = `${a.latitude},${a.longitude}`;
        hasta = sla?.expected_date ?? hasta;
      } catch {
        /* sin dirección: el repartidor la ve en la app Flex al escanear */
      }
    } else {
      const oe = (f.pedido.origenExterno ?? {}) as { direccion_envio?: DireccionWeb; telefono_envio?: string };
      const d = oe.direccion_envio;
      nombre = f.pedido.cliente?.nombre ?? null;
      telefono = oe.telefono_envio ?? f.pedido.cliente?.telefono ?? null;
      if (d) {
        direccion = [d.calle, d.numero].filter(Boolean).join(" ") || null;
        detalle = [d.piso && `piso ${d.piso}`, d.depto && `depto ${d.depto}`, d.notas].filter(Boolean).join(" · ") || null;
        localidad = d.ciudad ?? null;
      } else {
        direccion = f.pedido.cliente?.direccion ?? null;
      }
    }
    envios.push({
      id: f.id,
      origen: f.origen as "flex" | "web",
      estado: f.estado as EstadoReparto,
      motivo: f.motivo,
      zona: f.zonaNombre,
      precio: f.precio == null ? null : Number(f.precio),
      nombre,
      direccion,
      detalle,
      localidad,
      telefono,
      mapa: coordenadas ? `https://www.google.com/maps/search/?api=1&query=${coordenadas}` : direccion ? mapaDe(direccion, localidad) : null,
      hasta,
      productos,
    });
  }

  const dia = hoja.dia.toISOString().slice(0, 10);
  const lunes = lunesDe(dia);
  const deLaSemana = await prisma.envioReparto.findMany({
    where: { tenantId: TENANT, estado: "entregado", hoja: { dia: { gte: fechaDia(lunes), lt: new Date(fechaDia(lunes).getTime() + 7 * DIA_MS) } } },
    select: { precio: true },
  });
  return {
    dia,
    vence: hoja.vence!.toISOString(),
    envios,
    semana: { entregados: deLaSemana.length, total: deLaSemana.reduce((n, e) => n + Number(e.precio ?? 0), 0) },
  };
}

/** Lo que marca el repartidor. Lo pagado no se toca. */
export async function marcarDesdeLink(token: string, id: string, c: { estado?: unknown; motivo?: unknown }): Promise<{ ok: true } | { error: string; status: number }> {
  const hoja = await hojaValida(token);
  if (!hoja) return { error: "Este link ya venció. Pedile uno nuevo a Sendero.", status: 410 };
  const estado = c.estado as EstadoReparto;
  if (!["tomado", "rechazado", "entregado", "no_entregado", "ofrecido"].includes(estado)) return { error: "Estado no válido", status: 400 };
  const e = await prisma.envioReparto.findFirst({ where: { id, hojaId: hoja.id } });
  if (!e) return { error: "Ese envío no está en tu hoja", status: 404 };
  if (e.liquidacionId) return { error: "Ese envío ya se pagó", status: 409 };
  const motivo = typeof c.motivo === "string" ? c.motivo.trim().slice(0, 200) || null : null;
  await prisma.envioReparto.update({
    where: { id },
    data: { estado, motivo: estado === "no_entregado" || estado === "rechazado" ? motivo : null, marcadoEn: new Date() },
  });
  return { ok: true };
}

// ─── Semanas y liquidación ──────────────────────────────────────────────

export interface Semana {
  desde: string;
  hasta: string;
  porZona: Array<{ zona: string; precio: number; entregados: number; subtotal: number }>;
  entregados: number;
  total: number;
  noEntregados: number;
  sinCerrar: number;
  /** Ingreso (bonificación Flex o cobro de la web) menos el pago, de los entregados con dato. */
  ganancia: { ingreso: number; pago: number; conDato: number };
  /** Flex que él marcó entregados y ML no da como entregados. */
  noCoincidenMl: string[];
  liquidacion: { id: string; pagadoEn: string; total: number } | null;
  detalle: Array<{ id: string; dia: string; origen: string; zona: string | null; precio: number | null; estado: string; ingreso: number | null; envioMl: string | null }>;
}

export async function semanas(cuantas = 6): Promise<Semana[]> {
  const desde = new Date(fechaDia(lunesDe(hoyEnArgentina())).getTime() - (cuantas - 1) * 7 * DIA_MS);
  const filas = await prisma.envioReparto.findMany({
    where: { tenantId: TENANT, hoja: { dia: { gte: desde } } },
    include: { hoja: { select: { dia: true } }, pedido: { select: { precioEnvio: true } }, liquidacion: true },
  });
  const bonif = await prisma.flexMl.findMany({ where: { tenantId: TENANT, envioId: { in: filas.map((f) => f.envioMl).filter((x): x is string => !!x) } }, select: { envioId: true, monto: true } });
  const bonifDe = new Map(bonif.map((b) => [b.envioId, b.monto]));

  const porSemana = new Map<string, typeof filas>();
  for (const f of filas) {
    const l = lunesDe(f.hoja.dia.toISOString().slice(0, 10));
    porSemana.set(l, [...(porSemana.get(l) ?? []), f]);
  }

  const out: Semana[] = [];
  for (const [lunes, fs] of [...porSemana.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const entregados = fs.filter((f) => f.estado === "entregado");
    const zonas = new Map<string, { zona: string; precio: number; entregados: number; subtotal: number }>();
    for (const f of entregados) {
      const k = `${f.zonaNombre ?? "Sin zona"}|${Number(f.precio ?? 0)}`;
      const z = zonas.get(k) ?? { zona: f.zonaNombre ?? "Sin zona", precio: Number(f.precio ?? 0), entregados: 0, subtotal: 0 };
      z.entregados++;
      z.subtotal += Number(f.precio ?? 0);
      zonas.set(k, z);
    }
    const ingresoDe = (f: (typeof fs)[number]) => (f.origen === "flex" ? (f.envioMl ? (bonifDe.get(f.envioMl) ?? null) : null) : f.pedido.precioEnvio || null);
    const conDato = entregados.filter((f) => ingresoDe(f) != null);

    // Sólo para semanas sin pagar: los Flex "entregado" que ML no da como entregados.
    const noCoincidenMl: string[] = [];
    const liq = fs.find((f) => f.liquidacion)?.liquidacion ?? null;
    if (!liq) {
      for (const f of entregados.filter((x) => x.origen === "flex" && x.envioMl)) {
        const s = await mlFetch<{ status?: string }>(TENANT, `/shipments/${f.envioMl}`).catch(() => null);
        if (s && s.status !== "delivered") noCoincidenMl.push(f.envioMl!);
      }
    }

    out.push({
      desde: lunes,
      hasta: new Date(fechaDia(lunes).getTime() + 6 * DIA_MS).toISOString().slice(0, 10),
      porZona: [...zonas.values()].sort((a, b) => a.precio - b.precio),
      entregados: entregados.length,
      total: entregados.reduce((n, f) => n + Number(f.precio ?? 0), 0),
      noEntregados: fs.filter((f) => f.estado === "no_entregado").length,
      sinCerrar: fs.filter((f) => f.estado === "tomado" || f.estado === "ofrecido").length,
      ganancia: {
        ingreso: conDato.reduce((n, f) => n + (ingresoDe(f) ?? 0), 0),
        pago: conDato.reduce((n, f) => n + Number(f.precio ?? 0), 0),
        conDato: conDato.length,
      },
      noCoincidenMl,
      liquidacion: liq ? { id: liq.id, pagadoEn: liq.pagadoEn.toISOString(), total: Number(liq.total) } : null,
      detalle: fs.map((f) => ({ id: f.id, dia: f.hoja.dia.toISOString().slice(0, 10), origen: f.origen, zona: f.zonaNombre, precio: f.precio == null ? null : Number(f.precio), estado: f.estado, ingreso: ingresoDe(f), envioMl: f.envioMl })),
    });
  }
  return out;
}

/** Cierra la semana del lunes `desde`: los entregados sin pagar quedan en una liquidación pagada. */
export async function liquidar(desde: unknown, usuario: string | null): Promise<{ ok: true; total: number; envios: number } | { error: string }> {
  if (typeof desde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || lunesDe(desde) !== desde) return { error: "La semana tiene que empezar un lunes" };
  const inicio = fechaDia(desde);
  const fin = new Date(inicio.getTime() + 7 * DIA_MS);
  const entregados = await prisma.envioReparto.findMany({
    where: { tenantId: TENANT, estado: "entregado", liquidacionId: null, hoja: { dia: { gte: inicio, lt: fin } } },
    select: { id: true, precio: true },
  });
  if (!entregados.length) return { error: "No hay entregados sin pagar en esa semana" };
  const total = entregados.reduce((n, e) => n + Number(e.precio ?? 0), 0);
  await prisma.$transaction(async (tx) => {
    const l = await tx.liquidacionReparto.upsert({
      where: { tenantId_desde: { tenantId: TENANT, desde: inicio } },
      create: { desde: inicio, hasta: new Date(fin.getTime() - DIA_MS), envios: entregados.length, total, usuario },
      update: { envios: { increment: entregados.length }, total: { increment: total }, pagadoEn: new Date(), usuario },
    });
    await tx.envioReparto.updateMany({ where: { id: { in: entregados.map((e) => e.id) } }, data: { liquidacionId: l.id } });
  });
  return { ok: true, total, envios: entregados.length };
}

export async function guardarTarifas(cambios: unknown): Promise<{ ok: true } | { error: string }> {
  if (!Array.isArray(cambios)) return { error: "Formato inválido" };
  for (const c of cambios as Array<{ id?: unknown; precio?: unknown }>) {
    const n = Number(c.precio);
    if (typeof c.id !== "string" || !Number.isFinite(n) || n < 0 || n > 1_000_000) return { error: "Precio no válido" };
    const r = await prisma.zonaReparto.updateMany({ where: { id: c.id, tenantId: TENANT }, data: { precio: n } });
    if (!r.count) return { error: "Zona inexistente" };
  }
  return { ok: true };
}
