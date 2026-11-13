"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "motion/react";
import {
  Package, Clock, CheckCircle, DollarSign, TrendingUp, TrendingDown,
  AlertCircle, AlertTriangle, CalendarDays, ShoppingCart, ArrowRight, Wallet, FileWarning, Hammer, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NumeroAnimado } from "@/components/numero-animado";
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

function saludo() {
  const h = new Date().getHours();
  return h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

/* Las secciones aparecen una después de otra; cada tarjeta, apenas detrás de la anterior. */
const CONTENEDOR: Variants = { oculto: {}, visible: { transition: { staggerChildren: 0.05 } } };
const ITEM: Variants = {
  oculto: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
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
    return <p className="text-muted-foreground">Error cargando el panel.</p>;
  }

  const { contadores, despacho, entregas, finanzasMes, billeteraFab, mapeo, faltaFabricar, modelosTop } = data;
  const mes = new Date().toLocaleDateString("es-AR", { month: "long" });
  const enCola = mapeo.colaMl + mapeo.colaShop;
  const atrasados = total(despacho.atrasados);
  const maxVendido = Math.max(1, ...modelosTop.map((m) => m.totalVendido));

  return (
    <motion.div className="space-y-8" variants={CONTENEDOR} initial="oculto" animate="visible">
      <motion.div variants={ITEM} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{saludo()}</h1>
        </div>
        {atrasados > 0 ? (
          <Link href="/pedidos?estado=CONFIRMADO" className="inline-flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            {atrasados} {atrasados === 1 ? "pedido atrasado" : "pedidos atrasados"}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle className="h-4 w-4" /> Nada atrasado
          </span>
        )}
      </motion.div>

      {/* Lo que espera en la cola de Mapeo */}
      {enCola > 0 && (
        <motion.div variants={ITEM}>
          <Link href="/integraciones?tab=mapeo" className="group flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 transition-colors hover:bg-amber-500/10">
            <div className="rounded-lg bg-amber-500/20 p-2">
              <FileWarning className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {enCola} {enCola === 1 ? "producto espera" : "productos esperan"} en Mapeo
                <span className="font-normal text-muted-foreground">
                  {" "}({[mapeo.colaMl > 0 && `ML ${mapeo.colaMl}`, mapeo.colaShop > 0 && `Shop ${mapeo.colaShop}`].filter(Boolean).join(" · ")})
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {mapeo.pedidosEsperando > 0
                  ? `${mapeo.pedidosEsperando} ${mapeo.pedidosEsperando === 1 ? "pedido abierto no sabe" : "pedidos abiertos no saben"} qué producto descontar hasta que los mapees.`
                  : "No hay pedidos abiertos esperando, pero la próxima venta de esos productos sí va a esperar."}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      )}

      {/* Hoy: cada tarjeta abre su lista */}
      <section className="space-y-3">
        <motion.h2 variants={ITEM} className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Hoy
        </motion.h2>
        <motion.div variants={CONTENEDOR} className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <Estado label="Atrasados" detalle={detalleCanales(despacho.atrasados) || "Al día"} value={atrasados} icon={AlertTriangle} tono={atrasados > 0 ? "rojo" : "gris"} href="/pedidos?estado=CONFIRMADO" alerta={atrasados > 0} />
          <Estado label="Para despachar" detalle={`Hoy ${total(despacho.hoy)} · Mañana ${total(despacho.manana)}`} value={contadores.porDespachar} icon={CheckCircle} tono="azul" href="/pedidos?estado=CONFIRMADO" />
          <Estado
            label="Falta fabricar"
            detalle={faltaFabricar.piezas > 0 ? `${faltaFabricar.productos} ${faltaFabricar.productos === 1 ? "producto" : "productos"}` : "Todo cubierto"}
            value={faltaFabricar.piezas}
            icon={Hammer}
            tono="naranja"
            href="/produccion"
          />
          <Estado label="Pendientes de pago" value={contadores.pendientesPago} icon={Clock} tono="amarillo" href="/pedidos?estado=PENDIENTE_PAGO" />
          <Estado label="Esperando cobro ML" value={contadores.esperandoML} icon={AlertCircle} tono="violeta" href="/pedidos?estado=ESPERANDO_LIQUIDACION_ML" />
        </motion.div>
      </section>

      {/* El mes: lo cobrado, por la fecha en que se completó */}
      <section className="space-y-3">
        <motion.div variants={ITEM} className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{mes.charAt(0).toUpperCase() + mes.slice(1)}</h2>
          <Link href="/finanzas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            Ver finanzas <ArrowRight className="h-3 w-3" />
          </Link>
        </motion.div>
        <motion.div variants={CONTENEDOR} className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Plata
            label="Cobrado"
            valor={finanzasMes.cobrado}
            detalle={`${finanzasMes.pedidosCompletados} ${finanzasMes.pedidosCompletados === 1 ? "pedido completado" : "pedidos completados"}`}
            icon={DollarSign}
          />
          <Plata label="Ganancia bruta" valor={finanzasMes.margen} detalle={`Costo de fabricación: ${formatMoney(finanzasMes.costoFab)}`} icon={TrendingUp} />
          <Plata
            label="Cargos de ML"
            valor={finanzasMes.cargosMl}
            detalle={
              finanzasMes.percepcionesEstado === "ml"
                ? "Publicidad, percepciones y otros, sin lo de Shay"
                : `Percepciones ${finanzasMes.percepcionesEstado === "aproximada" ? "aproximadas" : "sin informar"}: ML las da al cerrar`
            }
            icon={TrendingDown}
          />
          <Plata
            label="Ganancia neta"
            valor={finanzasMes.neta}
            detalle={`Después de ${formatMoney(finanzasMes.gastosEmp)} de gastos empresariales`}
            icon={DollarSign}
            destacado={finanzasMes.neta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}
          />
          <motion.div variants={ITEM} whileHover={{ y: -2 }}>
            <Link href="/finanzas" className="block h-full rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-violet-500/0 p-4 transition-shadow hover:shadow-md">
              <div className="mb-2 flex items-center gap-2 text-violet-600 dark:text-violet-400">
                <Wallet className="h-4 w-4" />
                <span className="text-xs font-medium">Billetera fabricación</span>
              </div>
              <p className={`text-xl font-bold ${billeteraFab.disponible < 0 ? "text-red-500" : "text-violet-600 dark:text-violet-400"}`}>
                <NumeroAnimado valor={billeteraFab.disponible} formato={formatMoney} />
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Entró {formatMoney(billeteraFab.acumulado)} · Salió {formatMoney(billeteraFab.gastado)}
              </p>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      <motion.div variants={CONTENEDOR} className="grid gap-4 lg:grid-cols-2">
        {/* Lo más vendido */}
        <motion.section variants={ITEM} className="rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="mb-4 flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            Lo más vendido en 30 días
          </h2>
          {modelosTop.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas recientes.</p>
          ) : (
            <ol className="space-y-3">
              {modelosTop.map((m, i) => (
                <li key={m.modeloId}>
                  <Link href={`/modelos/${m.modeloId}`} className="group flex items-center gap-3">
                    <span className="w-5 text-sm font-medium tabular-nums text-muted-foreground">{i + 1}</span>
                    {m.imagenUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={m.imagenUrl} alt={m.nombre} className="h-10 w-10 rounded-lg object-cover ring-1 ring-border transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium group-hover:text-primary">{m.nombre}</span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(m.ingresos)}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full bg-primary/70"
                            initial={{ width: 0 }}
                            animate={{ width: `${(m.totalVendido / maxVendido) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.2 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                        <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{m.totalVendido} uds</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </motion.section>

        {/* Para despachar: primero lo atrasado */}
        <motion.section variants={ITEM} className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Para despachar
            </h2>
            <Link href="/pedidos" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Ver pedidos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              ["Atrasados", despacho.atrasados, "border-red-500/50 text-red-600 dark:text-red-400"],
              ["Hoy", despacho.hoy, ""],
              ["Mañana", despacho.manana, ""],
            ] as const).map(([label, c, clase]) => (
              <Badge key={label} variant="outline" className={`rounded-full text-xs font-normal ${total(c) > 0 ? clase : "text-muted-foreground"}`}>
                {label}: {total(c)}
                {total(c) > 0 && <span className="ml-1 text-muted-foreground">({detalleCanales(c)})</span>}
              </Badge>
            ))}
          </div>
          {entregas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay nada para despachar.</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {entregas.map((e) => {
                const estadoConfig = ESTADOS_PEDIDO[e.estado as keyof typeof ESTADOS_PEDIDO];
                const prioConfig = PRIORIDADES[e.prioridad as keyof typeof PRIORIDADES];
                const dias = diasRestantes(e.fechaEntrega);
                const esUrgente = dias === "Hoy" || dias === "Mañana" || dias.startsWith("Hace");
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${prioConfig?.color || "bg-slate-400"}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={e.cliente}>{e.cliente}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Badge variant="outline" className={`px-1 py-0 text-[10px] font-normal ${CANAL[e.canal].clase}`}>
                            {CANAL[e.canal].corto}
                          </Badge>
                          {e.flex && (
                            <span className="flex items-center gap-0.5 text-[10px]">
                              <Zap className="h-3 w-3" /> Flex
                            </span>
                          )}
                          {e.itemsCount} {e.itemsCount === 1 ? "pieza" : "piezas"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="gap-1 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${estadoConfig?.color || "bg-slate-400"}`} />
                        {estadoConfig?.label}
                      </Badge>
                      <span className={`w-14 text-right text-xs font-medium ${esUrgente ? "text-red-500" : "text-muted-foreground"}`}>{dias}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>
      </motion.div>
    </motion.div>
  );
}

const TONOS = {
  rojo: "bg-red-500/10 text-red-600 dark:text-red-400",
  azul: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  naranja: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  amarillo: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  violeta: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  gris: "bg-muted text-muted-foreground",
} as const;

function Estado({
  label,
  detalle,
  value,
  icon: Icono,
  tono,
  href,
  alerta,
}: {
  label: string;
  detalle?: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tono: keyof typeof TONOS;
  href: string;
  alerta?: boolean;
}) {
  return (
    <motion.div variants={ITEM} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
      <Link href={href} className={`block h-full rounded-xl border bg-card p-4 shadow-xs transition-shadow hover:shadow-md ${alerta ? "border-red-500/40 bg-red-500/5" : ""}`}>
        <div className="mb-3 flex items-center justify-between">
          <span className={`rounded-lg p-1.5 ${TONOS[tono]}`}>
            <Icono className="h-4 w-4" />
          </span>
          <span className={`text-2xl font-bold ${alerta ? "text-red-500" : ""}`}>
            <NumeroAnimado valor={value} />
          </span>
        </div>
        <p className="text-sm font-medium">{label}</p>
        {detalle && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detalle}</p>}
      </Link>
    </motion.div>
  );
}

function Plata({
  label,
  valor,
  detalle,
  icon: Icono,
  destacado,
}: {
  label: string;
  valor: number;
  detalle?: string;
  icon: React.ComponentType<{ className?: string }>;
  destacado?: string;
}) {
  return (
    <motion.div variants={ITEM} className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icono className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold ${destacado ?? ""}`}>
        <NumeroAnimado valor={valor} formato={formatMoney} />
      </p>
      {detalle && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detalle}</p>}
    </motion.div>
  );
}

/** La forma del Panel mientras carga. */
function Cargando() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-48" />
      </div>
      {[5, 5].map((n, k) => (
        <div key={k} className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: n }).map((_, i) => (
              <Skeleton key={i} className="h-[108px] rounded-xl" />
            ))}
          </div>
        </div>
      ))}
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
