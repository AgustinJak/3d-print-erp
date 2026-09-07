import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

/**
 * Reservas de stock por pedido.
 * ─────────────────────────────
 * Un pedido que entra "agarra" las piezas que necesita de la pila. La pieza
 * sigue físicamente en el galpón (`Stock.cantidad` no se toca) pero ya tiene
 * dueño: el disponible para el resto es `cantidad - reservado`.
 *
 * Cuando el pedido sale, la reserva se **consume**: ahí sí baja la cantidad y
 * queda el movimiento. Si el pedido se cancela o se borra, la reserva se suelta
 * y el stock vuelve a estar disponible.
 *
 * El reparto es determinista y se recalcula entero (`reasignarReservas`) cada
 * vez que algo cambia. No hay estado incremental que se pueda desincronizar: si
 * mañana aparece un bug, se corrige la función y el próximo recálculo lo arregla
 * todo. Lo único que no se recalcula son las reservas ya consumidas, que son
 * historia.
 *
 * Todo lo que no se puede cubrir se reporta. Nunca se ignora en silencio.
 */

type Tx = Prisma.TransactionClient;

/** Estados en los que el pedido todavía está en casa y retiene stock. */
export const ESTADOS_QUE_RESERVAN = [
  "PENDIENTE_PAGO",
  "CONFIRMADO",
  "EN_PRODUCCION",
  "TERMINADO",
  "RECLAMO_ABIERTO",
] as const;

/** Estados en los que la pieza ya salió: la reserva se convierte en descuento real. */
export const ESTADOS_QUE_CONSUMEN = [
  "ENTREGADO",
  "ESPERANDO_LIQUIDACION_ML",
  "COMPLETADO",
] as const;

const RESERVAN = new Set<string>(ESTADOS_QUE_RESERVAN);
const CONSUMEN = new Set<string>(ESTADOS_QUE_CONSUMEN);

/* ───────────────────────────── orden de la cola ───────────────────────────── */

interface PedidoRankeable {
  ordenProduccion: number | null;
  prioridad: string;
  canalVenta: string;
  fechaEntrega: Date | null;
  fechaPedido: Date;
}

/**
 * Quién agarra el stock primero cuando no alcanza para todos.
 *
 *  1. el orden manual de producción, si el usuario arrastró las filas
 *  2. prioridad URGENTE
 *  3. Mercado Libre antes que shop/directa (plazos duros y reputación en juego)
 *  4. la fecha de entrega más cercana
 *  5. el que entró primero
 *
 * Arrastrar en /pedidos o poner URGENTE alcanza para pasar a alguien adelante.
 */
export function clavesDeOrden(p: PedidoRankeable): number[] {
  return [
    p.ordenProduccion ?? Number.MAX_SAFE_INTEGER,
    p.prioridad === "URGENTE" ? 0 : 1,
    p.canalVenta === "mercadolibre" ? 0 : 1,
    p.fechaEntrega ? p.fechaEntrega.getTime() : Number.MAX_SAFE_INTEGER,
    p.fechaPedido.getTime(),
  ];
}

function compararCola(a: PedidoRankeable, b: PedidoRankeable): number {
  const ka = clavesDeOrden(a);
  const kb = clavesDeOrden(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}

/* ───────────────────────── qué piezas necesita un item ───────────────────────── */

export type MotivoSinStock =
  | "a_pedido"              // el modelo no se stockea: siempre se imprime
  | "combinacion_sin_fila"  // el modelo se stockea pero esta combinación no tiene fila
  | "falta_regla";          // lleva funda y nadie dijo cuál

export interface Componente {
  tipo: "producto" | "insumo";
  etiqueta: string;
  stockId: string | null;
  necesita: number;
  motivo?: MotivoSinStock;
}

interface VarianteCtx {
  nombre: string;
  afectaStock: boolean;
}

interface FilaStock {
  id: string;
  etiqueta: string;
  cantidad: number;
}

interface ReglaCtx {
  requiere: string[];
  stockId: string;
  cantidad: number;
}

export interface Contexto {
  stockPorClave: Map<string, FilaStock>;
  stockPorId: Map<string, FilaStock>;
  modelosStockeados: Set<string>;
  variantes: Map<string, VarianteCtx>;
  modelos: Map<string, string>;
  reglas: Map<string, ReglaCtx[]>;
}

/** Carga de una sola vez todo lo que hace falta para resolver cualquier item. */
export async function cargarContexto(db: Tx | typeof prisma, tenantId: string): Promise<Contexto> {
  const [filas, variantes, modelos, reglas] = await Promise.all([
    db.stock.findMany({
      where: { tenantId },
      select: { id: true, clave: true, etiqueta: true, cantidad: true, modeloId: true },
    }),
    db.varianteModelo.findMany({
      where: { modelo: { tenantId } },
      select: { id: true, nombre: true, afectaStock: true },
    }),
    db.modelo.findMany({ where: { tenantId }, select: { id: true, nombre: true } }),
    db.reglaInsumo.findMany({
      where: { tenantId },
      select: { modeloId: true, requiere: true, stockId: true, cantidad: true },
    }),
  ]);

  const stockPorClave = new Map<string, FilaStock>();
  const stockPorId = new Map<string, FilaStock>();
  const modelosStockeados = new Set<string>();
  for (const f of filas) {
    const fila = { id: f.id, etiqueta: f.etiqueta ?? "", cantidad: f.cantidad };
    stockPorClave.set(f.clave, fila);
    stockPorId.set(f.id, fila);
    modelosStockeados.add(f.modeloId);
  }

  const reglasPorModelo = new Map<string, ReglaCtx[]>();
  for (const r of reglas) {
    const arr = reglasPorModelo.get(r.modeloId) ?? [];
    arr.push({ requiere: r.requiere, stockId: r.stockId, cantidad: r.cantidad });
    reglasPorModelo.set(r.modeloId, arr);
  }

  return {
    stockPorClave,
    stockPorId,
    modelosStockeados,
    variantes: new Map(variantes.map((v) => [v.id, { nombre: v.nombre, afectaStock: v.afectaStock }])),
    modelos: new Map(modelos.map((m) => [m.id, m.nombre])),
    reglas: reglasPorModelo,
  };
}

interface ItemResoluble {
  modeloId: string;
  cantidad: number;
  variantesInfo: unknown;
}

/** Ids de variantes del inventario que quedaron registradas en el item. */
function variantesDelItem(item: ItemResoluble): string[] {
  const vi = Array.isArray(item.variantesInfo) ? (item.variantesInfo as Array<Record<string, unknown>>) : [];
  return vi
    .filter((v) => v?.matched && typeof v.varianteId === "string")
    .map((v) => v.varianteId as string);
}

/** ¿El item lleva funda? (una variante "Con Funda" / "Funda", no "Sin Funda") */
function llevaInsumoFunda(ids: string[], ctx: Contexto): boolean {
  return ids.some((id) => {
    const n = ctx.variantes.get(id)?.nombre ?? "";
    return /funda/i.test(n) && !/sin\s*funda/i.test(n);
  });
}

/**
 * Qué unidades de stock hacen falta para despachar un item:
 * la pieza principal, más los insumos que consume (la funda).
 */
export function componentesDeItem(item: ItemResoluble, ctx: Contexto): Componente[] {
  const ids = variantesDelItem(item);
  const out: Componente[] = [];

  // 1) la pieza principal: modelo + las variantes que definen una pieza distinta
  const idsStock = ids.filter((id) => ctx.variantes.get(id)?.afectaStock).sort();
  const clave = `${item.modeloId}|${idsStock.join(",")}`;
  const fila = ctx.stockPorClave.get(clave);
  const nombreModelo = ctx.modelos.get(item.modeloId) ?? "modelo desconocido";
  const sufijo = idsStock.map((id) => ctx.variantes.get(id)?.nombre).filter(Boolean).join(" · ");

  if (fila) {
    out.push({ tipo: "producto", etiqueta: fila.etiqueta || nombreModelo, stockId: fila.id, necesita: item.cantidad });
  } else {
    out.push({
      tipo: "producto",
      etiqueta: sufijo ? `${nombreModelo} · ${sufijo}` : nombreModelo,
      stockId: null,
      necesita: item.cantidad,
      // Si el modelo no tiene ninguna fila, es a pedido y está bien.
      // Si tiene filas pero no ésta, falta una fila y hay que verlo.
      motivo: ctx.modelosStockeados.has(item.modeloId) ? "combinacion_sin_fila" : "a_pedido",
    });
  }

  // 2) insumos por receta
  let insumos = 0;
  for (const regla of ctx.reglas.get(item.modeloId) ?? []) {
    if (!regla.requiere.every((r) => ids.includes(r))) continue;
    const f = ctx.stockPorId.get(regla.stockId);
    if (!f) continue;
    insumos++;
    out.push({
      tipo: "insumo",
      etiqueta: f.etiqueta || "insumo",
      stockId: regla.stockId,
      necesita: item.cantidad * regla.cantidad,
    });
  }

  // 3) lleva funda pero nadie definió cuál: se avisa, no se ignora
  if (insumos === 0 && llevaInsumoFunda(ids, ctx)) {
    out.push({
      tipo: "insumo",
      etiqueta: "Funda (sin regla)",
      stockId: null,
      necesita: item.cantidad,
      motivo: "falta_regla",
    });
  }

  return out;
}

/* ─────────────────────────── reparto de las reservas ─────────────────────────── */

export interface Faltante {
  pedidoId: string;
  itemId: string | null;
  tipo: "producto" | "insumo";
  etiqueta: string;
  falta: number;
  motivo?: MotivoSinStock;
}

export interface ResultadoReasignacion {
  pedidos: number;
  reservas: number;
  unidades: number;
  faltantes: Faltante[];
}

/**
 * Recalcula TODAS las reservas activas del tenant de cero.
 *
 * Idempotente: correrla dos veces seguidas da el mismo resultado. Se la puede
 * llamar después de cualquier cambio (pedido nuevo, conteo físico, cambio de
 * estado) sin preocuparse por el orden.
 */
export async function reasignarReservas(tenantId: string): Promise<ResultadoReasignacion> {
  return prisma.$transaction(
    async (tx) => {
      // Dos webhooks simultáneos no pueden repartir la misma pila.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservas:${tenantId}`}))`;

      // Marca de agua: hasta qué momento del stock mira este reparto. Se anota
      // al final y `reasignarSiElStockCambio` la compara para saber si quedó
      // algo sin repartir.
      const [marca] = await tx.$queryRaw<Array<{ hasta: Date | null }>>`
        SELECT max(updated_at) AS hasta FROM public.stock WHERE tenant_id = ${tenantId}
      `;

      const ctx = await cargarContexto(tx, tenantId);

      // Un pedido que ya consumió no vuelve a reservar (la pieza ya salió).
      const consumidas = await tx.reservaStock.findMany({
        where: { tenantId, estado: "CONSUMIDA" },
        select: { pedidoId: true },
        distinct: ["pedidoId"],
      });
      const yaConsumieron = new Set(consumidas.map((r) => r.pedidoId));

      const pedidos = (
        await tx.pedido.findMany({
          where: { tenantId, estado: { in: [...ESTADOS_QUE_RESERVAN] as never } },
          select: {
            id: true,
            ordenProduccion: true,
            prioridad: true,
            canalVenta: true,
            fechaEntrega: true,
            fechaPedido: true,
            items: { select: { id: true, modeloId: true, cantidad: true, variantesInfo: true } },
          },
        })
      ).filter((p) => !yaConsumieron.has(p.id));

      pedidos.sort(compararCola);

      await tx.reservaStock.deleteMany({ where: { tenantId, estado: "RESERVADA" } });

      // Un stock en negativo (vendido sin registrar) no reparte nada.
      const disponible = new Map<string, number>();
      for (const [id, f] of ctx.stockPorId) disponible.set(id, Math.max(0, f.cantidad));

      const nuevas: Prisma.ReservaStockCreateManyInput[] = [];
      const faltantes: Faltante[] = [];

      for (const p of pedidos) {
        for (const item of p.items) {
          for (const c of componentesDeItem(item, ctx)) {
            if (!c.stockId) {
              faltantes.push({
                pedidoId: p.id,
                itemId: item.id,
                tipo: c.tipo,
                etiqueta: c.etiqueta,
                falta: c.necesita,
                motivo: c.motivo,
              });
              continue;
            }
            const libre = disponible.get(c.stockId) ?? 0;
            const toma = Math.min(c.necesita, libre);
            if (toma > 0) {
              disponible.set(c.stockId, libre - toma);
              nuevas.push({
                tenantId,
                stockId: c.stockId,
                pedidoId: p.id,
                itemId: item.id,
                cantidad: toma,
                estado: "RESERVADA",
                tipo: c.tipo,
              });
            }
            if (toma < c.necesita) {
              faltantes.push({
                pedidoId: p.id,
                itemId: item.id,
                tipo: c.tipo,
                etiqueta: c.etiqueta,
                falta: c.necesita - toma,
              });
            }
          }
        }
      }

      if (nuevas.length > 0) await tx.reservaStock.createMany({ data: nuevas });

      await marcarReparto(tx, tenantId, marca?.hasta ?? null);

      return {
        pedidos: pedidos.length,
        reservas: nuevas.length,
        unidades: nuevas.reduce((a, r) => a + r.cantidad, 0),
        faltantes,
      };
    },
    { timeout: 20_000 }
  );
}

/**
 * Deja anotado hasta qué momento del stock llegó el último reparto.
 *
 * Se guarda la marca leída al abrir la transacción, no `now()`: si algo movió
 * la pila mientras se repartía, esa unidad todavía no se miró y tiene que
 * quedar pendiente para la próxima pasada.
 */
async function marcarReparto(tx: Tx, tenantId: string, hasta: Date | null): Promise<void> {
  const iso = (hasta ?? new Date()).toISOString();
  await tx.$executeRaw`
    INSERT INTO public.config_tenant (id, tenant_id, data)
    VALUES (gen_random_uuid()::text, ${tenantId}, jsonb_build_object('ultimoReparto', ${iso}))
    ON CONFLICT (tenant_id) DO UPDATE
      SET data = config_tenant.data || jsonb_build_object('ultimoReparto', ${iso})
  `;
}

/**
 * Reparte de nuevo, pero sólo si el stock se movió desde el último reparto.
 *
 * Existe por Bodega: cuando marca una pieza como producida no pasa por la API
 * del ERP, le habla derecho a Postgres (`bodega_mover_stock`). La cantidad sube
 * y nadie vuelve a repartirla, así que un pedido que estaba esperando esa pieza
 * seguía figurando en falta con la pieza ya en el galpón.
 *
 * El cron de ML también reparte, pero GitHub Actions estrangula los schedules:
 * en la práctica corre cada dos horas, no cada quince minutos. Demasiado tarde
 * para una pantalla que se mira justo después de cargar la producción.
 *
 * Son dos fechas: barato como para llamarla desde cualquier lectura que muestre
 * cobertura. Si no cambió nada, no toca la base.
 */
export async function reasignarSiElStockCambio(tenantId: string): Promise<ResultadoReasignacion | null> {
  const [estado] = await prisma.$queryRaw<Array<{ stock: Date | null; marca: string | null }>>`
    SELECT (SELECT max(updated_at) FROM public.stock WHERE tenant_id = ${tenantId}) AS stock,
           (SELECT data->>'ultimoReparto' FROM public.config_tenant WHERE tenant_id = ${tenantId}) AS marca
  `;

  const movido = estado?.stock;
  if (!movido) return null;
  if (estado.marca && new Date(estado.marca) >= movido) return null;
  return reasignarReservas(tenantId);
}

/* ───────────────────────── consumo y devolución ───────────────────────── */

/**
 * El pedido salió: lo reservado se descuenta de verdad y queda el movimiento.
 * Lo que nunca se pudo reservar no descuenta nada — se imprimió a pedido y el
 * stock ya estaba en cero.
 */
export async function consumirPedido(tenantId: string, pedidoId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const reservas = await tx.reservaStock.findMany({
      where: { tenantId, pedidoId, estado: "RESERVADA" },
    });
    for (const r of reservas) {
      await tx.stock.update({ where: { id: r.stockId }, data: { cantidad: { decrement: r.cantidad } } });
      await tx.movimientoStock.create({
        data: { stockId: r.stockId, delta: -r.cantidad, motivo: "venta", pedidoId },
      });
      await tx.reservaStock.update({
        where: { id: r.id },
        data: { estado: "CONSUMIDA", consumidaEn: new Date() },
      });
    }
    return reservas.reduce((a, r) => a + r.cantidad, 0);
  });
}

/**
 * El pedido se canceló o se dio marcha atrás: lo que ya se había descontado
 * vuelve a la pila, con su movimiento de devolución para que se vea por qué.
 * Lo meramente reservado se suelta solo en el próximo reparto.
 */
export async function devolverPedido(tenantId: string, pedidoId: string, motivo = "devolucion"): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const reservas = await tx.reservaStock.findMany({
      where: { tenantId, pedidoId, estado: "CONSUMIDA" },
    });
    for (const r of reservas) {
      await tx.stock.update({ where: { id: r.stockId }, data: { cantidad: { increment: r.cantidad } } });
      await tx.movimientoStock.create({
        data: { stockId: r.stockId, delta: r.cantidad, motivo, pedidoId },
      });
    }
    await tx.reservaStock.deleteMany({ where: { tenantId, pedidoId } });
    return reservas.reduce((a, r) => a + r.cantidad, 0);
  });
}

/**
 * Cancelación que llega de afuera: Mercado Libre dio de baja la venta.
 *
 * Decide sola si el stock vuelve, porque las dos cancelaciones no son la misma
 * cosa:
 *
 *  - **Todavía no salió**: la pieza sigue en el galpón. Se sueltan las reservas
 *    y lo que se hubiera descontado vuelve, con su movimiento.
 *  - **Ya salió**: el caso típico de ML —entregado, y semanas después una
 *    mediación le devuelve la plata al comprador—. Esa unidad la tiene él, no
 *    vuelve sola al galpón. Se deja el consumo como historia y el pedido queda
 *    marcado para que una persona mire si la caja volvió.
 *
 * Devolver el stock a ciegas acá inventaría unidades que no existen, y un
 * inventario inflado es peor que uno viejo: se termina vendiendo lo que no hay.
 */
export async function cancelarPedidoExterno(
  tenantId: string,
  pedidoId: string,
  motivo = "cancelacion_ml"
): Promise<{ devueltas: number; revisarStock: boolean }> {
  const yaSalio = await prisma.reservaStock.count({
    where: { tenantId, pedidoId, estado: "CONSUMIDA" },
  });

  if (yaSalio === 0) {
    const devueltas = await devolverPedido(tenantId, pedidoId, motivo);
    await reasignarReservas(tenantId);
    return { devueltas, revisarStock: false };
  }

  // Ya despachado: se sueltan las reservas que quedaran sueltas, pero el
  // consumo no se toca — la pieza no volvió sola.
  await prisma.reservaStock.deleteMany({ where: { tenantId, pedidoId, estado: "RESERVADA" } });
  await reasignarReservas(tenantId);
  return { devueltas: 0, revisarStock: true };
}

/**
 * Único punto por donde pasa un cambio de estado de pedido.
 *
 * Llamarla siempre después de guardar el estado nuevo — desde la UI, desde el
 * webhook de la Shop o desde la sincronización de Mercado Libre. Es idempotente:
 * si el pedido ya estaba consumido, no vuelve a descontar.
 */
export async function aplicarEstadoPedido(
  tenantId: string,
  pedidoId: string,
  estadoNuevo: string,
  opts: { reasignar?: boolean } = {}
) {
  if (CONSUMEN.has(estadoNuevo)) {
    await consumirPedido(tenantId, pedidoId);
  } else if (estadoNuevo === "CANCELADO" || RESERVAN.has(estadoNuevo)) {
    // Cancelado, o marcha atrás desde un estado ya despachado: devolver.
    await devolverPedido(tenantId, pedidoId, estadoNuevo === "CANCELADO" ? "cancelacion" : "correccion");
  }
  // En lotes (backfill) conviene repartir una sola vez al final, no por pedido.
  if (opts.reasignar === false) return null;
  return reasignarReservas(tenantId);
}

/* ─────────────────────────── cobertura para la UI ─────────────────────────── */

export interface ComponenteCobertura {
  tipo: "producto" | "insumo";
  etiqueta: string;
  stockId: string | null;
  necesita: number;
  reservado: number;
  falta: number;
  motivo?: MotivoSinStock;
}

export interface CoberturaPedido {
  estado: "completa" | "parcial" | "sin_stock" | "a_pedido" | "despachado";
  falta: number;
  posicion: number | null;
  componentes: Record<string, ComponenteCobertura[]>; // itemId → componentes
}

/**
 * Qué tiene cubierto cada pedido y qué le falta, para pintarlo en la lista.
 * No escribe nada: lee las reservas que dejó el último reparto.
 */
export async function coberturaDePedidos(
  tenantId: string,
  pedidos: Array<{
    id: string;
    estado: string;
    ordenProduccion: number | null;
    prioridad: string;
    canalVenta: string;
    fechaEntrega: Date | null;
    fechaPedido: Date;
    items: Array<{ id: string; modeloId: string; cantidad: number; variantesInfo: unknown }>;
  }>
): Promise<Map<string, CoberturaPedido>> {
  const out = new Map<string, CoberturaPedido>();
  if (pedidos.length === 0) return out;

  const ctx = await cargarContexto(prisma, tenantId);
  const reservas = await prisma.reservaStock.findMany({
    where: { tenantId, pedidoId: { in: pedidos.map((p) => p.id) } },
    select: { pedidoId: true, itemId: true, stockId: true, cantidad: true, estado: true },
  });

  const porItem = new Map<string, number>();
  const consumidos = new Set<string>();
  for (const r of reservas) {
    if (r.estado === "CONSUMIDA") consumidos.add(r.pedidoId);
    porItem.set(`${r.itemId}|${r.stockId}`, (porItem.get(`${r.itemId}|${r.stockId}`) ?? 0) + r.cantidad);
  }

  // La posición en la cola es la del reparto: mismo criterio, misma respuesta.
  const enCola = pedidos.filter((p) => RESERVAN.has(p.estado) && !consumidos.has(p.id)).sort(compararCola);
  const posiciones = new Map(enCola.map((p, i) => [p.id, i + 1]));

  for (const p of pedidos) {
    const componentes: Record<string, ComponenteCobertura[]> = {};
    let falta = 0;
    let conStock = 0;
    let total = 0;

    for (const item of p.items) {
      componentes[item.id] = componentesDeItem(item, ctx).map((c) => {
        const reservado = c.stockId ? (porItem.get(`${item.id}|${c.stockId}`) ?? 0) : 0;
        const f = Math.max(0, c.necesita - reservado);
        total++;
        if (reservado >= c.necesita) conStock++;
        falta += f;
        return {
          tipo: c.tipo,
          etiqueta: c.etiqueta,
          stockId: c.stockId,
          necesita: c.necesita,
          reservado,
          falta: f,
          motivo: c.motivo,
        };
      });
    }

    const soloAPedido = Object.values(componentes)
      .flat()
      .every((c) => c.motivo === "a_pedido");

    // Un pedido que ya salió no tiene nada que esperar: su cobertura es
    // historia. Vale tanto si consumió reservas como si es viejo y se despachó
    // antes de que existieran — si no, quedaría pidiendo stock para siempre.
    const yaSalio = CONSUMEN.has(p.estado) || consumidos.has(p.id);

    out.set(p.id, {
      estado: yaSalio
        ? "despachado"
        : soloAPedido && total > 0
          ? "a_pedido"
          : falta === 0
            ? "completa"
            : conStock > 0
              ? "parcial"
              : "sin_stock",
      falta,
      posicion: posiciones.get(p.id) ?? null,
      componentes,
    });
  }

  return out;
}
