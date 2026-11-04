"use client";

import { useEffect, useState } from "react";
import {
  Package, Clock, CheckCircle, DollarSign, TrendingUp, TrendingDown,
  AlertCircle, AlertTriangle, Loader2, CalendarDays, ShoppingCart, ArrowRight, Wallet, FileWarning, Hammer, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ESTADOS_PEDIDO, PRIORIDADES } from "@/lib/constants";
import Link from "next/link";

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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.contadores) {
    return <p className="text-muted-foreground">Error cargando el dashboard.</p>;
  }

  const { contadores, despacho, entregas, finanzasMes, billeteraFab, mapeo, faltaFabricar, modelosTop } = data;
  const mes = new Date().toLocaleDateString("es-AR", { month: "long" });
  const enCola = mapeo.colaMl + mapeo.colaShop;
  const atrasados = total(despacho.atrasados);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel Principal</h1>
        <Badge variant="outline" className="text-sm">
          {new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
        </Badge>
      </div>

      {/* Banner: lo que espera en la cola de Mapeo */}
      {enCola > 0 && (
        <Link href="/integraciones?tab=mapeo" className="block">
          <Card className="border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 transition-colors">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-500/20 p-2">
                <FileWarning className="h-5 w-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">
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
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Estado operativo: cada tarjeta abre su lista */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatusCard
          label="Atrasados"
          detalle={detalleCanales(despacho.atrasados)}
          value={atrasados}
          icon={<AlertTriangle className="h-4 w-4" />}
          color={atrasados > 0 ? "text-red-500" : "text-muted-foreground"}
          href="/pedidos?estado=CONFIRMADO"
          alerta={atrasados > 0}
        />
        <StatusCard
          label="Para despachar"
          detalle={`Hoy ${total(despacho.hoy)} · Mañana ${total(despacho.manana)}`}
          value={contadores.porDespachar}
          icon={<CheckCircle className="h-4 w-4" />}
          color="text-blue-500"
          href="/pedidos?estado=CONFIRMADO"
        />
        <StatusCard
          label="Falta fabricar"
          detalle={faltaFabricar.piezas > 0 ? `${faltaFabricar.productos} ${faltaFabricar.productos === 1 ? "producto" : "productos"}` : "Todo cubierto"}
          value={faltaFabricar.piezas}
          icon={<Hammer className="h-4 w-4" />}
          color="text-orange-500"
          href="/produccion"
        />
        <StatusCard
          label="Pendientes de pago"
          value={contadores.pendientesPago}
          icon={<Clock className="h-4 w-4" />}
          color="text-yellow-500"
          href="/pedidos?estado=PENDIENTE_PAGO"
        />
        <StatusCard
          label="Esperando cobro ML"
          value={contadores.esperandoML}
          icon={<AlertCircle className="h-4 w-4" />}
          color="text-purple-500"
          href="/pedidos?estado=ESPERANDO_LIQUIDACION_ML"
        />
      </div>

      {/* Finanzas del mes: lo cobrado, por la fecha en que se completó */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <FinanceCard
          label={`Cobrado en ${mes}`}
          value={formatMoney(finanzasMes.cobrado)}
          detalle={`${finanzasMes.pedidosCompletados} ${finanzasMes.pedidosCompletados === 1 ? "pedido completado" : "pedidos completados"}`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <FinanceCard
          label="Ganancia bruta"
          value={formatMoney(finanzasMes.margen)}
          detalle={`Costo de fabricación: ${formatMoney(finanzasMes.costoFab)}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <FinanceCard
          label="Cargos de ML"
          value={formatMoney(finanzasMes.cargosMl)}
          detalle={
            finanzasMes.percepcionesEstado === "ml"
              ? "Publicidad, percepciones y otros, sin lo de Shay"
              : `Percepciones ${finanzasMes.percepcionesEstado === "aproximada" ? "aproximadas" : "sin informar"}: ML las da al cerrar`
          }
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <FinanceCard
          label="Ganancia neta"
          value={formatMoney(finanzasMes.neta)}
          detalle={`Después de ${formatMoney(finanzasMes.gastosEmp)} de gastos empresariales`}
          icon={<DollarSign className="h-4 w-4" />}
          highlight={finanzasMes.neta > 0 ? "text-emerald-500" : "text-red-500"}
        />
        <Link href="/finanzas" className="block">
          <Card className="h-full border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10 transition-colors">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1 text-violet-500">
                <Wallet className="h-4 w-4" />
                <span className="text-xs">Billetera Fabricación</span>
              </div>
              <p className={`text-xl font-bold ${billeteraFab.disponible < 0 ? "text-red-500" : "text-violet-500"}`}>
                {formatMoney(billeteraFab.disponible)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Entró: {formatMoney(billeteraFab.acumulado)} | Salió: {formatMoney(billeteraFab.gastado)}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Modelos más vendidos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Productos más vendidos (30 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {modelosTop.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas recientes.</p>
            ) : (
              <div className="space-y-3">
                {modelosTop.map((m, i) => (
                  <div key={m.modeloId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground w-5">#{i + 1}</span>
                      {m.imagenUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={m.imagenUrl}
                          alt={m.nombre}
                          className="h-8 w-8 rounded object-cover border"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium">{m.nombre}</span>
                        {m.categorias.length > 0 && (
                          <div className="flex gap-1 mt-0.5">
                            {m.categorias.map(({ categoria }) => (
                              <Badge
                                key={categoria.id}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                                style={categoria.color ? { backgroundColor: categoria.color, color: "#fff" } : undefined}
                              >
                                {categoria.nombre}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{m.totalVendido} uds</span>
                      <span className="text-sm font-medium w-24 text-right">{formatMoney(m.ingresos)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Para despachar: primero lo atrasado */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Para despachar
              </CardTitle>
              <Link href="/pedidos" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                Ver pedidos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              {([
                ["Atrasados", despacho.atrasados, "border-red-500/50 text-red-600 dark:text-red-400"],
                ["Hoy", despacho.hoy, ""],
                ["Mañana", despacho.manana, ""],
              ] as const).map(([label, c, clase]) => (
                <Badge key={label} variant="outline" className={`text-xs font-normal ${total(c) > 0 ? clase : "text-muted-foreground"}`}>
                  {label}: {total(c)}
                  {total(c) > 0 && <span className="ml-1 text-muted-foreground">({detalleCanales(c)})</span>}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {entregas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay nada para despachar.</p>
            ) : (
              <div className="space-y-3">
                {entregas.map((e) => {
                  const estadoConfig = ESTADOS_PEDIDO[e.estado as keyof typeof ESTADOS_PEDIDO];
                  const prioConfig = PRIORIDADES[e.prioridad as keyof typeof PRIORIDADES];
                  const dias = diasRestantes(e.fechaEntrega);
                  const esUrgente = dias === "Hoy" || dias === "Mañana" || dias.startsWith("Hace");
                  return (
                    <div key={e.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${prioConfig?.color || "bg-slate-400"}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" title={e.cliente}>{e.cliente}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Badge variant="outline" className={`text-[10px] px-1 py-0 font-normal ${CANAL[e.canal].clase}`}>
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
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${estadoConfig?.color || "bg-slate-400"}`} />
                          {estadoConfig?.label}
                        </Badge>
                        <span className={`text-xs font-medium w-14 text-right ${esUrgente ? "text-red-500" : "text-muted-foreground"}`}>
                          {dias}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  detalle,
  value,
  icon,
  color,
  href,
  alerta,
}: {
  label: string;
  detalle?: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  href: string;
  alerta?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <Card className={`h-full hover:shadow-md hover:bg-muted/40 transition ${alerta ? "border-red-500/40 bg-red-500/5" : ""}`}>
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-1">
            <span className={color}>{icon}</span>
            <span className={`text-2xl font-bold ${alerta ? "text-red-500" : ""}`}>{value}</span>
          </div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {detalle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{detalle}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function FinanceCard({
  label,
  value,
  detalle,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  detalle?: string;
  icon: React.ReactNode;
  highlight?: string;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className={`text-xl font-bold ${highlight || ""}`}>{value}</p>
        {detalle && <p className="text-[10px] text-muted-foreground mt-1">{detalle}</p>}
      </CardContent>
    </Card>
  );
}
