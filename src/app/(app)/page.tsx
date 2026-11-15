"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "motion/react";
import {
  Package, Clock, CheckCircle,
  AlertCircle, AlertTriangle, CalendarDays, ShoppingCart, ArrowRight, Wallet, FileWarning, Hammer, Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NumeroAnimado } from "@/components/numero-animado";
import { GraficoDelMes, type DiaDeVenta } from "@/components/panel/grafico-del-mes";
import { ESTADOS_PEDIDO, PRIORIDADES } from "@/lib/constants";

/**
 * El Panel (docs/sdd/011, rediseño): primero lo que hay que hacer hoy, después cómo va el mes y al
 * final lo que se vende y lo que hay que despachar. Cada tarjeta abre su lista.
 */

type Canal = "mercadolibre" | "shop" | "otros";
type PorCanal = Record<Canal, number>;

interface DashboardData {
  contadores: {
    pendientesPago: number;
    porDespachar: number;
    esperandoML: number;
  };
  despacho: { atrasados: PorCanal; hoy: PorCanal; manana: PorCanal };
  entregas: {
    id: string;
    cliente: string;
    fechaEntrega: string;
    estado: string;
    prioridad: string;
    canal: Canal;
    flex: boolean;
    itemsCount: number;
  }[];
  finanzasMes: {
    cobrado: number;
    costoFab: number;
    margen: number;
    cargosMl: number;
    percepcionesEstado: "ml" | "aproximada" | "pendiente";
    gastosEmp: number;
    neta: number;
    pedidosCompletados: number;
  };
  billeteraFab: {
    acumulado: number;
    gastado: number;
    disponible: number;
  };
  mapeo: { colaMl: number; colaShop: number; pedidosEsperando: number };
  faltaFabricar: { piezas: number; productos: number };
  modelosTop: {
    modeloId: string;
    nombre: string;
    imagenUrl: string | null;
    categorias: Array<{ categoria: { id: string; nombre: string; color: string | null } }>;
    totalVendido: number;
    ingresos: number;
  }[];
  /** Lo vendido día por día, este mes y el anterior (para el gráfico). */
  ventasDiarias?: { actual: { mes: string; dias: DiaDeVenta[] }; anterior: { mes: string; dias: DiaDeVenta[] } };
}

const CANAL: Record<Canal, { corto: string; clase: string }> = {
  mercadolibre: { corto: "ML", clase: "border-yellow-500/50 text-yellow-600 dark:text-yellow-400" },
  shop: { corto: "Shop", clase: "border-sky-500/50 text-sky-600 dark:text-sky-400" },
  otros: { corto: "Directa", clase: "border-slate-500/50 text-muted-foreground" },
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

/** Días de calendario entre hoy y la fecha, en la hora local: "Hoy", "Mañana", "Hace 3d". */
function diasRestantes(fecha: string) {
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dia(new Date(fecha)) - dia(new Date())) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff < 0) return `Hace ${Math.abs(diff)}d`;
  return `En ${diff}d`;
}

/** "ML 3 · Shop 1": sólo los canales que tienen algo. */
function detalleCanales(c: PorCanal) {
  return (Object.keys(CANAL) as Canal[])
    .filter((k) => c[k] > 0)
    .map((k) => `${CANAL[k].corto} ${c[k]}`)
    .join(" · ");
}

const total = (c: PorCanal) => c.mercadolibre + c.shop + c.otros;

/* Una sola entrada al cargar: las secciones suben un poco, de a una (a lo sumo seis). */
const CONTENEDOR: Variants = { oculto: {}, visible: { transition: { staggerChildren: 0.05 } } };
const ITEM: Variants = {
  oculto: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <Cargando />;

  if (!data?.contadores) {
    return <p className="text-muted-foreground">No se pudo cargar el panel</p>;
  }

  const { contadores, despacho, entregas, finanzasMes, billeteraFab, mapeo, faltaFabricar, modelosTop } = data;
  const hoy = new Date();
  const mes = hoy.toLocaleDateString("es-AR", { month: "long" });
  const Mes = mes.charAt(0).toUpperCase() + mes.slice(1);
  const fecha = hoy.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const enCola = mapeo.colaMl + mapeo.colaShop;
  const atrasados = total(despacho.atrasados);
  const maxVendido = Math.max(1, ...modelosTop.map((m) => m.totalVendido));

  return (
    <motion.div className="mx-auto max-w-[1440px] space-y-10" variants={CONTENEDOR} initial="oculto" animate="visible">
      {/* El título es el día */}
      <motion.header variants={ITEM} className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[28px] leading-[1.15] font-medium">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</h1>
        {atrasados > 0 ? (
          <Link href="/pedidos?estado=CONFIRMADO" className="inline-flex items-center gap-2 rounded-lg border border-red-500/25 px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-500/5 dark:text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {atrasados} {atrasados === 1 ? "pedido atrasado" : "pedidos atrasados"}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Nada atrasado
          </span>
        )}
      </motion.header>

      {enCola > 0 && (
        <motion.div variants={ITEM}>
          <Link href="/integraciones?tab=mapeo" className="group flex items-center gap-3 rounded-xl border border-amber-500/30 bg-card px-5 py-4 transition-colors hover:bg-muted/50">
            <FileWarning className="h-[18px] w-[18px] shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.5} />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {enCola} {enCola === 1 ? "producto espera" : "productos esperan"} en Mapeo
                <span className="font-normal text-muted-foreground">
                  {" "}· {[mapeo.colaMl > 0 && `ML ${mapeo.colaMl}`, mapeo.colaShop > 0 && `Shop ${mapeo.colaShop}`].filter(Boolean).join(" · ")}
                </span>
              </p>
              <p className="text-[13px] text-muted-foreground">
                {mapeo.pedidosEsperando > 0
                  ? `${mapeo.pedidosEsperando} ${mapeo.pedidosEsperando === 1 ? "pedido abierto no sabe" : "pedidos abiertos no saben"} qué producto descontar hasta que los mapees`
                  : "No hay pedidos abiertos esperando, pero la próxima venta de esos productos sí va a esperar"}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </Link>
        </motion.div>
      )}

      {/* Hoy: lo que hay que hacer. Cada número abre su lista. */}
      <motion.section variants={ITEM} className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Hoy</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-5">
          <Estado label="Atrasados" detalle={detalleCanales(despacho.atrasados) || "Al día"} value={atrasados} icon={AlertTriangle} href="/pedidos?estado=CONFIRMADO" alerta={atrasados > 0} />
          <Estado label="Para despachar" detalle={`Hoy ${total(despacho.hoy)} · mañana ${total(despacho.manana)}`} value={contadores.porDespachar} icon={CheckCircle} href="/pedidos?estado=CONFIRMADO" />
          <Estado
            label="Falta fabricar"
            detalle={faltaFabricar.piezas > 0 ? `${faltaFabricar.productos} ${faltaFabricar.productos === 1 ? "producto" : "productos"}` : "Todo cubierto"}
            value={faltaFabricar.piezas}
            icon={Hammer}
            href="/produccion"
          />
          <Estado label="Pendientes de pago" value={contadores.pendientesPago} icon={Clock} href="/pedidos?estado=PENDIENTE_PAGO" />
          <Estado label="Esperando cobro ML" value={contadores.esperandoML} icon={AlertCircle} href="/pedidos?estado=ESPERANDO_LIQUIDACION_ML" className="col-span-2 lg:col-span-1" />
        </div>
      </motion.section>

      {/* El mes: el gráfico de lo vendido es la pieza central; al lado, la ganancia neta y la billetera */}
      <motion.section variants={ITEM} className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">{Mes}</h2>
          <Link href="/finanzas" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            Finanzas <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border bg-card p-6 xl:col-span-2">
            {data.ventasDiarias ? <GraficoDelMes actual={data.ventasDiarias.actual} anterior={data.ventasDiarias.anterior} /> : <p className="text-sm text-muted-foreground">Sin ventas para mostrar</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">Ganancia neta</p>
              <p className={`mt-1 font-mono text-[32px] leading-none font-medium tabular-nums ${finanzasMes.neta < 0 ? "text-red-600 dark:text-red-400" : "text-primary"}`}>
                <NumeroAnimado valor={finanzasMes.neta} formato={formatMoney} />
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {finanzasMes.pedidosCompletados} {finanzasMes.pedidosCompletados === 1 ? "pedido completado" : "pedidos completados"}
              </p>
              {/* Cómo se llega a la neta, de arriba abajo */}
              <dl className="mt-5 space-y-2 border-t pt-4 text-[13px]">
                <Renglon label="Cobrado" valor={finanzasMes.cobrado} />
                <Renglon label="Costo de fabricación" valor={-finanzasMes.costoFab} />
                <Renglon
                  label="Cargos de ML"
                  valor={-finanzasMes.cargosMl}
                  nota={finanzasMes.percepcionesEstado === "ml" ? undefined : `percepciones ${finanzasMes.percepcionesEstado === "aproximada" ? "aproximadas" : "sin informar"}`}
                />
                <Renglon label="Gastos empresariales" valor={-finanzasMes.gastosEmp} />
              </dl>
            </div>
            <Link href="/finanzas" className="flex flex-col rounded-xl border bg-card p-6 transition-colors hover:bg-muted/40">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" strokeWidth={1.5} /> Billetera de fabricación
              </p>
              <p className={`mt-1 font-mono text-[24px] leading-none font-medium tabular-nums ${billeteraFab.disponible < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                <NumeroAnimado valor={billeteraFab.disponible} formato={formatMoney} />
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Entró <span className="font-mono tabular-nums">{formatMoney(billeteraFab.acumulado)}</span> · salió <span className="font-mono tabular-nums">{formatMoney(billeteraFab.gastado)}</span>
              </p>
            </Link>
          </div>
        </div>
      </motion.section>

      <motion.div variants={ITEM} className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Lo más vendido: las fotos son el momento de la pantalla */}
        <section className="rounded-xl border bg-card p-6">
          <h2 className="mb-5 flex items-center gap-2 font-medium">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            Lo más vendido en 30 días
          </h2>
          {modelosTop.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas en los últimos 30 días</p>
          ) : (
            <ol className="space-y-4">
              {modelosTop.map((m, i) => (
                <li key={m.modeloId}>
                  <Link href={`/modelos/${m.modeloId}`} className="group flex items-center gap-4">
                    {m.imagenUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={m.imagenUrl} alt={m.nombre} className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-border" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Package className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium transition-colors group-hover:text-primary">{m.nombre}</span>
                        <span className="shrink-0 font-mono text-[13px] tabular-nums text-muted-foreground">{formatMoney(m.ingresos)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          {/* Se anima con transform, no con el ancho. La primera lleva el acento. */}
                          <motion.div
                            className={`h-full origin-left rounded-full ${i === 0 ? "bg-primary" : "bg-foreground/25"}`}
                            style={{ width: `${(m.totalVendido / maxVendido) * 100}%` }}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                        <span className="w-14 text-right font-mono text-xs tabular-nums text-muted-foreground">{m.totalVendido} u.</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Para despachar: primero lo atrasado */}
        <section className="rounded-xl border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-medium">
              <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              Para despachar
            </h2>
            <Link href="/pedidos" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Pedidos <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          </div>
          <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {([
              ["Atrasados", despacho.atrasados],
              ["Hoy", despacho.hoy],
              ["Mañana", despacho.manana],
            ] as const).map(([label, c]) => (
              <span key={label} className={label === "Atrasados" && total(c) > 0 ? "text-red-600 dark:text-red-400" : ""}>
                {label} <span className="font-mono tabular-nums text-foreground">{total(c)}</span>
                {total(c) > 0 && <span> ({detalleCanales(c)})</span>}
              </span>
            ))}
          </p>
          {entregas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay nada para despachar</p>
          ) : (
            <ul className="-mx-3">
              {entregas.map((e) => {
                const estadoConfig = ESTADOS_PEDIDO[e.estado as keyof typeof ESTADOS_PEDIDO];
                const prioConfig = PRIORIDADES[e.prioridad as keyof typeof PRIORIDADES];
                const dias = diasRestantes(e.fechaEntrega);
                const esUrgente = dias === "Hoy" || dias === "Mañana" || dias.startsWith("Hace");
                return (
                  <li key={e.id} className="flex h-12 items-center justify-between gap-3 rounded-lg px-3 transition-colors hover:bg-muted/50">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${prioConfig?.color || "bg-muted-foreground/40"}`} title={prioConfig?.label} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={e.cliente}>{e.cliente}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-mono">{CANAL[e.canal].corto}</span>
                          {e.flex && (
                            <span className="inline-flex items-center gap-0.5">
                              · <Zap className="h-3 w-3" strokeWidth={1.5} /> Flex
                            </span>
                          )}
                          <span>· {e.itemsCount} {e.itemsCount === 1 ? "pieza" : "piezas"}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${estadoConfig?.color || "bg-muted-foreground/40"}`} />
                        {estadoConfig?.label}
                      </span>
                      <span className={`w-16 text-right font-mono ${esUrgente ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>{dias}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </motion.div>
    </motion.div>
  );
}

/** Un número de "Hoy": la cifra, su nombre y un detalle. Sin colores propios: sólo lo atrasado es rojo. */
function Estado({
  label,
  detalle,
  value,
  icon: Icono,
  href,
  alerta,
  className = "",
}: {
  label: string;
  detalle?: string;
  value: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href: string;
  alerta?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={`group block bg-card p-5 transition-[background-color,transform] duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none active:scale-[0.98] ${className}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icono className="h-4 w-4" strokeWidth={1.5} />
        {label}
      </div>
      <p className={`mt-3 font-mono text-[28px] leading-none font-medium tabular-nums ${alerta ? "text-red-600 dark:text-red-400" : ""}`}>
        <NumeroAnimado valor={value} />
      </p>
      {detalle && <p className="mt-2 truncate text-xs text-muted-foreground">{detalle}</p>}
    </Link>
  );
}

/** Un renglón de cómo se llega a la ganancia neta: lo que resta, con su signo. */
function Renglon({ label, valor, nota }: { label: string; valor: number; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">
        {label}
        {nota && <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">({nota})</span>}
      </dt>
      <dd className="font-mono tabular-nums">
        {valor < 0 ? "− " : ""}
        {formatMoney(Math.abs(valor))}
      </dd>
    </div>
  );
}

/** La forma del Panel mientras carga. */
function Cargando() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-10">
      <Skeleton className="h-8 w-72" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-[124px] rounded-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-20" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-60 rounded-xl lg:col-span-2" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
