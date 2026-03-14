"use client";

import { useEffect, useState } from "react";
import {
  Package, Clock, CheckCircle, Truck, DollarSign, TrendingUp,
  AlertCircle, Loader2, CalendarDays, ShoppingCart, ArrowRight, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ESTADOS_PEDIDO, PRIORIDADES } from "@/lib/constants";
import Link from "next/link";

interface DashboardData {
  contadores: {
    enProduccion: number;
    pendientesPago: number;
    terminados: number;
    esperandoML: number;
    confirmados: number;
    entregados: number;
    totalActivos: number;
  };
  finanzasMes: {
    ingresos: number;
    costoFab: number;
    gastos: number;
    ganancia: number;
    pedidosCompletados: number;
  };
  billeteraFab: {
    acumulado: number;
    gastado: number;
    disponible: number;
  };
  productosTop: { nombre: string; cantidad: number; ingresos: number }[];
  proximasEntregas: {
    id: string;
    cliente: string;
    fechaEntrega: string;
    estado: string;
    prioridad: string;
    itemsCount: number;
  }[];
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function diasRestantes(fecha: string) {
  const diff = Math.ceil((new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff < 0) return `Hace ${Math.abs(diff)}d`;
  return `En ${diff}d`;
}

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

  if (!data) {
    return <p className="text-muted-foreground">Error cargando el dashboard.</p>;
  }

  const { contadores, finanzasMes, billeteraFab, productosTop, proximasEntregas } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panel Principal</h1>
        <Badge variant="outline" className="text-sm">
          {new Date().toLocaleDateString("es-AR", { month: "long", year: "numeric" })}
        </Badge>
      </div>

      {/* Estado operativo */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatusCard
          label="En producción"
          value={contadores.enProduccion}
          icon={<Package className="h-4 w-4" />}
          color="text-orange-500"
        />
        <StatusCard
          label="Pendientes pago"
          value={contadores.pendientesPago}
          icon={<Clock className="h-4 w-4" />}
          color="text-yellow-500"
        />
        <StatusCard
          label="Confirmados"
          value={contadores.confirmados}
          icon={<CheckCircle className="h-4 w-4" />}
          color="text-blue-500"
        />
        <StatusCard
          label="Terminados"
          value={contadores.terminados}
          icon={<CheckCircle className="h-4 w-4" />}
          color="text-emerald-500"
        />
        <StatusCard
          label="Entregados"
          value={contadores.entregados}
          icon={<Truck className="h-4 w-4" />}
          color="text-green-600"
        />
        <StatusCard
          label="Esperando ML"
          value={contadores.esperandoML}
          icon={<AlertCircle className="h-4 w-4" />}
          color="text-purple-500"
        />
      </div>

      {/* Finanzas del mes */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <FinanceCard label="Ingresos del mes" value={formatMoney(finanzasMes.ingresos)} icon={<DollarSign className="h-4 w-4" />} />
        <FinanceCard label="Costo fabricación" value={formatMoney(finanzasMes.costoFab)} icon={<TrendingUp className="h-4 w-4" />} />
        <FinanceCard
          label="Ganancia del mes"
          value={formatMoney(finanzasMes.ganancia)}
          icon={<TrendingUp className="h-4 w-4" />}
          highlight={finanzasMes.ganancia > 0 ? "text-emerald-500" : "text-red-500"}
        />
        <FinanceCard label="Pedidos completados" value={String(finanzasMes.pedidosCompletados)} icon={<ShoppingCart className="h-4 w-4" />} />
        <Card className="border-violet-500/30 bg-violet-500/5">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1 text-violet-500">
              <Wallet className="h-4 w-4" />
              <span className="text-xs">Billetera Fabricación</span>
            </div>
            <p className="text-xl font-bold text-violet-500">{formatMoney(billeteraFab.disponible)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Acum: {formatMoney(billeteraFab.acumulado)} | Usado: {formatMoney(billeteraFab.gastado)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Productos más vendidos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Productos más vendidos (30 días)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {productosTop.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas recientes.</p>
            ) : (
              <div className="space-y-3">
                {productosTop.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-muted-foreground w-5">#{i + 1}</span>
                      <span className="text-sm font-medium">{p.nombre}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">{p.cantidad} uds</span>
                      <span className="text-sm font-medium w-24 text-right">{formatMoney(p.ingresos)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximas entregas */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Próximas entregas
              </CardTitle>
              <Link href="/pedidos" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                Ver pedidos <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {proximasEntregas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay entregas próximas.</p>
            ) : (
              <div className="space-y-3">
                {proximasEntregas.map((e) => {
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
                          <p className="text-xs text-muted-foreground">{e.itemsCount} piezas</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${estadoConfig?.color || "bg-slate-400"}`} />
                          {estadoConfig?.label}
                        </Badge>
                        <span className={`text-xs font-medium ${esUrgente ? "text-red-500" : "text-muted-foreground"}`}>
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

function StatusCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-1">
          <span className={color}>{icon}</span>
          <span className="text-2xl font-bold">{value}</span>
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function FinanceCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: string }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className={`text-xl font-bold ${highlight || ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
