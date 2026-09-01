"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, ArrowLeft, ArrowRight,
  Wallet, Users, Save, Clock, Download, Factory, Building2, ArrowRightLeft,
  PlusCircle, MinusCircle, Calendar, Trash2, Receipt, Package, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/data-loading";
import { toast } from "sonner";
import { ShayCard } from "./shay-card";

interface Socio {
  nombre: string;
  porcentaje: number;
}

interface CuotaEnCurso {
  grupoCuotasId: string;
  descripcion: string;
  categoria: string;
  billetera: string;
  montoCuota: number;
  cuotaTotal: number;
  pagadas: number;
  pendientes: number;
  proximaCuotaFecha: string | null;
  proximaCuotaNumero: number | null;
  totalAcumulado: number;
}

interface CuotaPagada {
  id: string;
  fecha: string;
  monto: number;
  categoria: string;
  descripcion: string | null;
  billetera: string;
  cuotaNumero: number | null;
  cuotaTotal: number | null;
  grupoCuotasId: string | null;
}

interface Transferencia {
  id: string;
  fecha: string;
  monto: number;
  desde: string;
  hacia: string;
  descripcion: string | null;
}

interface Movimiento {
  id: string;
  fecha: string;
  tipo: "gasto" | "cuota" | "transferencia" | "aporte" | "retiro" | "pedido";
  descripcion: string;
  billetera: string;
  monto: number;
  direccion: "entrada" | "salida" | "ambos";
  meta?: {
    categoria?: string;
    cuotaNumero?: number;
    cuotaTotal?: number;
    grupoCuotasId?: string;
    desde?: string;
    hacia?: string;
    pedidoId?: string;
    externoId?: string;
    aporteFab?: number;
    aporteEmp?: number;
    items?: number;
  };
}

interface FinanzasData {
  mes: {
    ingresos: number;
    costoFab: number;
    gastos: number;
    gastosFab: number;
    gastosEmp: number;
    ganancia: number;
    gananciaNeta: number;
    totalPedidos: number;
  };
  anio: {
    ingresos: number;
    costoFab: number;
    gastos: number;
    ganancia: number;
    totalPedidos: number;
  };
  billeteraFab: {
    acumulado: number;
    gastado: number;
    compromisosFuturos: number;
    transferencias: number;
    disponible: number;
    mes: number;
  };
  billeteraEmp: {
    acumulado: number;
    gastado: number;
    compromisosFuturos: number;
    transferencias: number;
    disponible: number;
    mes: number;
  };
  gastosPorCategoria: Record<string, number>;
  pedidosEnCurso: {
    total: number;
    costoFab: number;
    ganancia: number;
    cobrado: number;
    pendiente: number;
    cantidad: number;
    porEstado: Record<string, { cantidad: number; total: number }>;
  };
  cuotasEnCurso: CuotaEnCurso[];
  cuotasPagadasMes: CuotaPagada[];
  transferenciasMes: Transferencia[];
  movimientos: Movimiento[];
  flex: { bonificado: number; pagadoLogistica: number; sobrante: number };
  datosMensuales: {
    mes: string;
    ingresos: number;
    costoFab: number;
    gastos: number;
    gastosFab: number;
    gastosEmp: number;
    ganancia: number;
  }[];
  mesActual: number;
  anioActual: number;
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function labelBilletera(b: string) {
  if (b === "fabricacion") return "Fabricación";
  if (b === "empresarial") return "Empresarial";
  if (b === "externo") return "Externo";
  return b;
}

function getMovimientoConfig(m: { tipo: string; direccion: string; billetera: string }) {
  switch (m.tipo) {
    case "gasto":
      return {
        Icon: Receipt,
        bgClass: "bg-red-500/10",
        iconClass: "text-red-500",
        amountClass: "text-red-500",
        sign: "−",
      };
    case "cuota":
      return {
        Icon: Calendar,
        bgClass: "bg-blue-500/10",
        iconClass: "text-blue-500",
        amountClass: "text-blue-500",
        sign: "−",
      };
    case "transferencia":
      return {
        Icon: ArrowRightLeft,
        bgClass: "bg-purple-500/10",
        iconClass: "text-purple-500",
        amountClass: "text-purple-500",
        sign: "↔",
      };
    case "aporte":
      return {
        Icon: ArrowDownRight,
        bgClass: "bg-emerald-500/10",
        iconClass: "text-emerald-500",
        amountClass: "text-emerald-500",
        sign: "+",
      };
    case "retiro":
      return {
        Icon: ArrowUpRight,
        bgClass: "bg-amber-500/10",
        iconClass: "text-amber-500",
        amountClass: "text-amber-500",
        sign: "−",
      };
    case "pedido":
      return {
        Icon: Package,
        bgClass: "bg-green-500/10",
        iconClass: "text-green-500",
        amountClass: "text-emerald-500",
        sign: "+",
      };
    default:
      return {
        Icon: Wallet,
        bgClass: "bg-muted",
        iconClass: "text-muted-foreground",
        amountClass: "text-foreground",
        sign: "",
      };
  }
}

export default function FinanzasPage() {
  const [data, setData] = useState<FinanzasData | null>(null);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [initialLoading, setInitialLoading] = useState(true);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

  // Transferencia dialog
  const [transferDialog, setTransferDialog] = useState(false);
  const [transferForm, setTransferForm] = useState({
    desde: "empresarial",
    hacia: "fabricacion",
    monto: "",
    descripcion: "",
    fecha: new Date().toISOString().slice(0, 10),
  });
  const [savingTransfer, setSavingTransfer] = useState(false);

  // Gasto Flex (pago a la logística)
  const [flexDialog, setFlexDialog] = useState(false);
  const [flexForm, setFlexForm] = useState({
    monto: "",
    descripcion: "Pago Flex logística",
    fecha: new Date().toISOString().slice(0, 10),
    billetera: "empresarial",
  });
  const [savingFlex, setSavingFlex] = useState(false);

  // Timeline
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "gasto" | "cuota" | "transferencia" | "pedido">("todos");
  const [billeteraFiltro, setBilleteraFiltro] = useState<"todas" | "fabricacion" | "empresarial">("todas");

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/finanzas?mes=${mes}&anio=${anio}`);
    setData(await res.json());
    setInitialLoading(false);
  }, [mes, anio]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch("/api/config")
      .then(r => r.json())
      .then(cfg => { if (cfg?.socios) setSocios(cfg.socios); });
  }, []);

  const handlePorcentaje = (idx: number, val: string) => {
    const n = Math.min(100, Math.max(0, parseFloat(val) || 0));
    const otro = 100 - n;
    setSocios(prev => prev.map((s, i) =>
      i === idx ? { ...s, porcentaje: n } : { ...s, porcentaje: otro }
    ));
    setConfigDirty(true);
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ socios }),
    });
    setSavingConfig(false);
    setConfigDirty(false);
  };

  const prevMonth = () => {
    if (mes === 1) { setMes(12); setAnio(anio - 1); }
    else setMes(mes - 1);
  };

  const nextMonth = () => {
    if (mes === 12) { setMes(1); setAnio(anio + 1); }
    else setMes(mes + 1);
  };

  const openTransfer = (preset?: "transferir" | "aporte" | "retiro") => {
    if (preset === "aporte") {
      setTransferForm({ desde: "externo", hacia: "empresarial", monto: "", descripcion: "Aporte del socio", fecha: new Date().toISOString().slice(0, 10) });
    } else if (preset === "retiro") {
      setTransferForm({ desde: "empresarial", hacia: "externo", monto: "", descripcion: "Retiro del socio", fecha: new Date().toISOString().slice(0, 10) });
    } else {
      setTransferForm({ desde: "empresarial", hacia: "fabricacion", monto: "", descripcion: "", fecha: new Date().toISOString().slice(0, 10) });
    }
    setTransferDialog(true);
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferForm.desde === transferForm.hacia) {
      toast.error("Origen y destino no pueden ser iguales");
      return;
    }
    setSavingTransfer(true);
    const res = await fetch("/api/transferencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transferForm),
    });
    setSavingTransfer(false);
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error || "Error al guardar");
      return;
    }
    toast.success("Movimiento registrado");
    setTransferDialog(false);
    fetchData();
  };

  const deleteTransfer = async (id: string) => {
    if (!confirm("¿Eliminar este movimiento?")) return;
    await fetch(`/api/transferencias/${id}`, { method: "DELETE" });
    toast.success("Movimiento eliminado");
    fetchData();
  };

  const openFlexGasto = () => {
    setFlexForm({
      monto: "",
      descripcion: "Pago Flex logística",
      fecha: new Date().toISOString().slice(0, 10),
      billetera: "empresarial",
    });
    setFlexDialog(true);
  };

  const submitFlexGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingFlex(true);
    const res = await fetch("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoria: "Flex",
        monto: flexForm.monto,
        descripcion: flexForm.descripcion,
        fecha: flexForm.fecha,
        billetera: flexForm.billetera,
      }),
    });
    setSavingFlex(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "Error al guardar");
      return;
    }
    toast.success("Pago Flex registrado");
    setFlexDialog(false);
    fetchData();
  };

  if (initialLoading) return <TableSkeleton cols={4} />;
  if (!data) return null;

  const exportarCSV = () => {
    const sep = ";";
    const lines: string[] = [];
    lines.push(`Resumen Financiero - ${MESES[mes - 1]} ${anio}`);
    lines.push("");
    lines.push(["Concepto", "Monto"].join(sep));
    lines.push(["Ingresos del mes", data.mes.ingresos].join(sep));
    lines.push(["Costo de fabricación", data.mes.costoFab].join(sep));
    lines.push(["Ganancia bruta", data.mes.ganancia].join(sep));
    lines.push(["Gastos fabricación", data.mes.gastosFab].join(sep));
    lines.push(["Gastos empresariales", data.mes.gastosEmp].join(sep));
    lines.push(["Ganancia neta", data.mes.gananciaNeta].join(sep));
    lines.push(["Pedidos completados", data.mes.totalPedidos].join(sep));
    lines.push("");
    lines.push("Billetera de Fabricación");
    lines.push(["Disponible", data.billeteraFab.disponible].join(sep));
    lines.push(["Acumulado", data.billeteraFab.acumulado].join(sep));
    lines.push(["Gastado", data.billeteraFab.gastado].join(sep));
    lines.push("");
    lines.push("Billetera Empresarial");
    lines.push(["Disponible", data.billeteraEmp.disponible].join(sep));
    lines.push(["Acumulado", data.billeteraEmp.acumulado].join(sep));
    lines.push(["Gastado", data.billeteraEmp.gastado].join(sep));
    if (Object.keys(data.gastosPorCategoria).length > 0) {
      lines.push("");
      lines.push("Gastos por categoría");
      lines.push(["Categoría", "Monto"].join(sep));
      Object.entries(data.gastosPorCategoria)
        .sort(([, a], [, b]) => b - a)
        .forEach(([cat, monto]) => lines.push([cat, monto].join(sep)));
    }
    lines.push("");
    lines.push("Resumen anual " + anio);
    lines.push(["Mes", "Ingresos", "Costo fab.", "Gastos", "Ganancia"].join(sep));
    data.datosMensuales.forEach((d) => {
      lines.push([d.mes, d.ingresos, d.costoFab, d.gastos, d.ganancia].join(sep));
    });

    const BOM = "﻿";
    const blob = new Blob([BOM + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finanzas_${MESES[mes - 1].toLowerCase()}_${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Finanzas</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportarCSV} className="gap-1.5" title="Exportar resumen">
            <Download className="h-4 w-4" /> Exportar
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnio(anio - 1)} title="Año anterior">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={prevMonth} title="Mes anterior">
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {MESES[mes - 1]} <span className="font-bold">{anio}</span>
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth} title="Mes siguiente">
            <ArrowRight className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnio(anio + 1)} title="Año siguiente">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Ventas de Shay en la cuenta compartida: plata que hay que pasarle */}
      <ShayCard mes={mes} anio={anio} nombreMes={MESES[mes - 1]} />

      {/* Flex — dato informativo */}
      {data.flex && (data.flex.bonificado > 0 || data.flex.pagadoLogistica > 0) && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Package className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-blue-600 dark:text-blue-400">Flex (informativo)</h2>
                  <p className="text-xs text-muted-foreground">
                    Bonificación de ML vs lo que pagás a la logística este mes. No suma a las billeteras.
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={openFlexGasto}>
                <PlusCircle className="h-4 w-4 mr-1.5" /> Cargar pago Flex
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Bonificado por ML</p>
                <p className="text-xl font-bold text-blue-600">{formatMoney(data.flex.bonificado)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pagado a logística (gastos &quot;Flex&quot;)</p>
                <p className="text-xl font-bold">{formatMoney(data.flex.pagadoLogistica)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sobrante (vueltito)</p>
                <p className={`text-xl font-bold ${data.flex.sobrante >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatMoney(data.flex.sobrante)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pedidos en curso */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Pedidos en curso</h2>
              <p className="text-xs text-muted-foreground">
                {data.pedidosEnCurso.cantidad} pedido{data.pedidosEnCurso.cantidad !== 1 ? "s" : ""} activos (excluye completados y cancelados)
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total a cobrar</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatMoney(data.pedidosEnCurso.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ganancia proyectada</p>
              <p className="text-lg font-semibold text-green-600">{formatMoney(data.pedidosEnCurso.ganancia)}</p>
              <p className="text-xs text-muted-foreground">Costo fab: {formatMoney(data.pedidosEnCurso.costoFab)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ya cobrado (señas)</p>
              <p className="text-lg font-semibold text-green-600">{formatMoney(data.pedidosEnCurso.cobrado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendiente de cobro</p>
              <p className="text-lg font-semibold">{formatMoney(data.pedidosEnCurso.pendiente)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Por estado</p>
              {Object.entries(data.pedidosEnCurso.porEstado).map(([estado, info]) => {
                const labels: Record<string, string> = {
                  PENDIENTE_PAGO: "Pendiente pago",
                  CONFIRMADO: "Confirmado",
                  EN_PRODUCCION: "En producción",
                  TERMINADO: "Terminado",
                  ENTREGADO: "Entregado",
                  ESPERANDO_LIQUIDACION_ML: "Liquid. ML",
                };
                return (
                  <div key={estado} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{labels[estado] ?? estado} ({info.cantidad})</span>
                    <span className="font-medium">{formatMoney(info.total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Billeteras + acciones */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Billeteras</h2>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => openTransfer("transferir")} className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" /> Transferir
            </Button>
            <Button variant="outline" size="sm" onClick={() => openTransfer("aporte")} className="gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10">
              <PlusCircle className="h-3.5 w-3.5" /> Aporte
            </Button>
            <Button variant="outline" size="sm" onClick={() => openTransfer("retiro")} className="gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10">
              <MinusCircle className="h-3.5 w-3.5" /> Retiro
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Billetera Fabricación */}
          <Card className="border-violet-500/30 bg-violet-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-violet-500/10">
                  <Factory className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-violet-500">Billetera de Fabricación</h2>
                  <p className="text-xs text-muted-foreground">Para reinversión: filamento, impresoras, herramientas</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Disponible</p>
                  <p className={`text-2xl font-bold ${data.billeteraFab.disponible >= 0 ? "text-violet-500" : "text-red-500"}`}>
                    {formatMoney(data.billeteraFab.disponible)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Acumulado</p>
                  <p className="text-lg font-semibold">{formatMoney(data.billeteraFab.acumulado)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gastado en reinversión</p>
                  <p className="text-base">{formatMoney(data.billeteraFab.gastado)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Aportado este mes</p>
                  <p className="text-base">{formatMoney(data.billeteraFab.mes)}</p>
                </div>
                {data.billeteraFab.compromisosFuturos > 0 && (
                  <div className="col-span-2 pt-2 border-t border-violet-500/20">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Compromisos futuros (cuotas pendientes)
                    </p>
                    <p className="text-sm font-medium text-amber-500">
                      −{formatMoney(data.billeteraFab.compromisosFuturos)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Aún no se descontó. Disponible proyectado:{" "}
                      <span className={data.billeteraFab.disponible - data.billeteraFab.compromisosFuturos >= 0 ? "" : "text-red-500"}>
                        {formatMoney(data.billeteraFab.disponible - data.billeteraFab.compromisosFuturos)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Billetera Empresarial */}
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Building2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-emerald-500">Billetera Empresarial</h2>
                  <p className="text-xs text-muted-foreground">Ganancia neta acumulada: alquiler, sueldos, retiros</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Disponible</p>
                  <p className={`text-2xl font-bold ${data.billeteraEmp.disponible >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {formatMoney(data.billeteraEmp.disponible)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Acumulado</p>
                  <p className="text-lg font-semibold">{formatMoney(data.billeteraEmp.acumulado)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gastado</p>
                  <p className="text-base">{formatMoney(data.billeteraEmp.gastado)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ganancia este mes</p>
                  <p className="text-base">{formatMoney(data.billeteraEmp.mes)}</p>
                </div>
                {data.billeteraEmp.compromisosFuturos > 0 && (
                  <div className="col-span-2 pt-2 border-t border-emerald-500/20">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Compromisos futuros (cuotas pendientes)
                    </p>
                    <p className="text-sm font-medium text-amber-500">
                      −{formatMoney(data.billeteraEmp.compromisosFuturos)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Aún no se descontó. Disponible proyectado:{" "}
                      <span className={data.billeteraEmp.disponible - data.billeteraEmp.compromisosFuturos >= 0 ? "" : "text-red-500"}>
                        {formatMoney(data.billeteraEmp.disponible - data.billeteraEmp.compromisosFuturos)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resumen mensual */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Resumen del mes</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Ingresos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(data.mes.ingresos)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> Costo fabricación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatMoney(data.mes.costoFab)}</p>
              <p className="text-xs text-muted-foreground mt-1">Va a fabricación</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Ganancia bruta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${data.mes.ganancia >= 0 ? "text-green-600" : "text-red-500"}`}>
                {formatMoney(data.mes.ganancia)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Va a empresarial</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Ganancia neta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${data.mes.gananciaNeta >= 0 ? "text-green-600" : "text-red-500"}`}>
                {formatMoney(data.mes.gananciaNeta)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Después de gastos empresariales</p>
            </CardContent>
          </Card>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
          <Card className="bg-muted/30">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Factory className="h-3 w-3" /> Gastos fabricación</p>
              <p className="text-lg font-semibold text-violet-500">{formatMoney(data.mes.gastosFab)}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Gastos empresariales</p>
              <p className="text-lg font-semibold text-emerald-500">{formatMoney(data.mes.gastosEmp)}</p>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><ShoppingCart className="h-3 w-3" /> Pedidos completados</p>
              <p className="text-lg font-semibold">{data.mes.totalPedidos}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cuotas en curso */}
      {data.cuotasEnCurso && data.cuotasEnCurso.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Cuotas en curso
              <span className="text-xs text-muted-foreground font-normal">({data.cuotasEnCurso.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.cuotasEnCurso.map((c) => {
              const pctPagada = c.cuotaTotal > 0 ? (c.pagadas / c.cuotaTotal) * 100 : 0;
              return (
                <div key={c.grupoCuotasId} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.descripcion || c.categoria}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-xs">{c.categoria}</Badge>
                        <Badge variant="outline" className={`text-xs ${c.billetera === "empresarial" ? "border-emerald-500/30 text-emerald-500" : "border-violet-500/30 text-violet-500"}`}>
                          {labelBilletera(c.billetera)}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatMoney(c.totalAcumulado)}</p>
                      <p className="text-xs text-muted-foreground">{formatMoney(c.montoCuota)}/cuota</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {c.pagadas}/{c.cuotaTotal} pagadas · {c.pendientes} pendientes
                      </span>
                      {c.proximaCuotaFecha && (
                        <span className="text-muted-foreground">
                          próxima: cuota {c.proximaCuotaNumero} el {new Date(c.proximaCuotaFecha).toLocaleDateString("es-AR")}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${pctPagada}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Historial unificado de movimientos del mes */}
      {data.movimientos && data.movimientos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Historial del mes
                <span className="text-xs text-muted-foreground font-normal">
                  ({data.movimientos.filter((m) => {
                    if (tipoFiltro !== "todos" && m.tipo !== tipoFiltro && !(tipoFiltro === "transferencia" && (m.tipo === "aporte" || m.tipo === "retiro"))) return false;
                    if (billeteraFiltro !== "todas" && m.billetera !== billeteraFiltro && m.billetera !== "ambos") {
                      const desde = m.meta?.desde;
                      const hacia = m.meta?.hacia;
                      if (desde !== billeteraFiltro && hacia !== billeteraFiltro) return false;
                    }
                    return true;
                  }).length})
                </span>
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-md border text-xs overflow-hidden">
                  {([
                    { val: "todos", label: "Todos" },
                    { val: "gasto", label: "Gastos" },
                    { val: "cuota", label: "Cuotas" },
                    { val: "transferencia", label: "Mov." },
                    { val: "pedido", label: "Pedidos" },
                  ] as const).map((e, i) => (
                    <button
                      key={e.val}
                      type="button"
                      onClick={() => setTipoFiltro(e.val)}
                      className={`px-2 h-7 transition-colors ${
                        tipoFiltro === e.val ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                      } ${i > 0 ? "border-l" : ""}`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-md border text-xs overflow-hidden">
                  {([
                    { val: "todas", label: "Todas" },
                    { val: "fabricacion", label: "Fab" },
                    { val: "empresarial", label: "Emp" },
                  ] as const).map((e, i) => (
                    <button
                      key={e.val}
                      type="button"
                      onClick={() => setBilleteraFiltro(e.val)}
                      className={`px-2 h-7 transition-colors ${
                        billeteraFiltro === e.val ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                      } ${i > 0 ? "border-l" : ""}`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.movimientos
              .filter((m) => {
                if (tipoFiltro !== "todos") {
                  if (tipoFiltro === "transferencia" && !(m.tipo === "transferencia" || m.tipo === "aporte" || m.tipo === "retiro")) return false;
                  if (tipoFiltro !== "transferencia" && m.tipo !== tipoFiltro) return false;
                }
                if (billeteraFiltro !== "todas" && m.billetera !== billeteraFiltro && m.billetera !== "ambos") {
                  const desde = m.meta?.desde;
                  const hacia = m.meta?.hacia;
                  if (desde !== billeteraFiltro && hacia !== billeteraFiltro) return false;
                }
                return true;
              })
              .map((m) => {
                const config = getMovimientoConfig(m);
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 py-2 border-b last:border-b-0 hover:bg-muted/30 -mx-2 px-2 rounded-md transition-colors"
                  >
                    {/* Icon */}
                    <div className={`shrink-0 h-8 w-8 rounded-md flex items-center justify-center ${config.bgClass}`}>
                      <config.Icon className={`h-4 w-4 ${config.iconClass}`} />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.descripcion}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {new Date(m.fecha).toLocaleDateString("es-AR")}
                        </span>
                        {m.tipo === "cuota" && m.meta?.cuotaNumero && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 border-blue-500/30 text-blue-500">
                            {m.meta.cuotaNumero}/{m.meta.cuotaTotal}
                          </Badge>
                        )}
                        {m.meta?.categoria && (
                          <span className="text-xs text-muted-foreground">{m.meta.categoria}</span>
                        )}
                        {m.tipo === "transferencia" && m.meta?.desde && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1">
                            {labelBilletera(m.meta.desde)} → {labelBilletera(m.meta.hacia!)}
                          </Badge>
                        )}
                        {m.tipo !== "transferencia" && m.tipo !== "aporte" && m.tipo !== "retiro" && m.billetera !== "ambos" && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] py-0 px-1 ${
                              m.billetera === "empresarial"
                                ? "border-emerald-500/30 text-emerald-500"
                                : "border-violet-500/30 text-violet-500"
                            }`}
                          >
                            {labelBilletera(m.billetera)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {/* Monto */}
                    <div className="text-right shrink-0">
                      {m.tipo === "pedido" && m.meta ? (
                        <>
                          <p className="text-sm font-semibold text-emerald-500">+{formatMoney(m.monto)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Fab: +{formatMoney(m.meta.aporteFab || 0)} · Emp: +{formatMoney(m.meta.aporteEmp || 0)}
                          </p>
                        </>
                      ) : (
                        <p className={`text-sm font-semibold ${config.amountClass}`}>
                          {config.sign}{formatMoney(m.monto)}
                        </p>
                      )}
                    </div>
                    {/* Delete button para transferencias */}
                    {(m.tipo === "transferencia" || m.tipo === "aporte" || m.tipo === "retiro") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => deleteTransfer(m.id.replace(/^t-/, ""))}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
            {data.movimientos.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                Sin movimientos registrados este mes
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gráfico anual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen mensual ({anio})</CardTitle>
          <div className="flex flex-wrap gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm bg-primary" /> Ingresos
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm bg-orange-500" /> Costo fab.
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm bg-red-400" /> Gastos
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm bg-green-500" /> Ganancia
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1.5 h-60">
            {data.datosMensuales.map((d, i) => {
              const maxVal = Math.max(...data.datosMensuales.map(m => Math.max(m.ingresos, m.costoFab + m.gastos, 1)));
              const barH = (val: number) => Math.max((val / maxVal) * 200, val > 0 ? 3 : 0);
              const isActive = i + 1 === mes;
              return (
                <div key={i} className={`flex-1 flex flex-col items-center gap-1 ${isActive ? "opacity-100" : "opacity-60"}`}>
                  <div className="w-full flex gap-[2px] items-end justify-center" style={{ height: 210 }}>
                    <div className="flex-1 flex flex-col items-stretch justify-end gap-[1px]">
                      <div
                        className="rounded-t bg-primary"
                        style={{ height: `${barH(d.ingresos)}px` }}
                        title={`Ingresos: $${(d.ingresos / 1000).toFixed(0)}k`}
                      />
                    </div>
                    <div className="flex-1 flex flex-col items-stretch justify-end gap-[1px]">
                      <div
                        className="bg-orange-500 rounded-t"
                        style={{ height: `${barH(d.costoFab)}px` }}
                        title={`Costo fab: $${(d.costoFab / 1000).toFixed(0)}k`}
                      />
                      {d.gastos > 0 && (
                        <div
                          className="bg-red-400"
                          style={{ height: `${barH(d.gastos)}px` }}
                          title={`Gastos: $${(d.gastos / 1000).toFixed(0)}k`}
                        />
                      )}
                    </div>
                    <div className="flex-1 flex flex-col items-stretch justify-end">
                      <div
                        className={`rounded-t ${d.ganancia >= 0 ? "bg-green-500" : "bg-red-500"}`}
                        style={{ height: `${barH(Math.abs(d.ganancia))}px` }}
                        title={`Ganancia: $${(d.ganancia / 1000).toFixed(0)}k`}
                      />
                    </div>
                  </div>
                  <span className={`text-xs ${isActive ? "font-bold" : "text-muted-foreground"}`}>
                    {d.mes}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Gastos por categoría */}
      {Object.keys(data.gastosPorCategoria).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gastos del mes por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(data.gastosPorCategoria)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, monto]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <Badge variant="outline">{cat}</Badge>
                    <span className="font-medium">{formatMoney(monto)}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sueldos */}
      {socios.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground">Sueldos del mes</h2>
            </div>
            {configDirty && (
              <Button size="sm" variant="outline" onClick={saveConfig} disabled={savingConfig} className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {savingConfig ? "Guardando..." : "Guardar porcentajes"}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {socios.map((socio, idx) => {
              const ganancia = data.mes.gananciaNeta;
              const sueldo = ganancia > 0 ? ganancia * (socio.porcentaje / 100) : 0;
              const initials = socio.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
              const colors = ["bg-blue-500", "bg-emerald-500"];
              return (
                <Card key={idx} className="border-primary/10">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full ${colors[idx % 2]} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{socio.nombre}</p>
                        <p className="text-3xl font-bold mt-1 text-green-600">
                          {formatMoney(sueldo)}
                        </p>
                        {ganancia <= 0 && (
                          <p className="text-xs text-muted-foreground mt-1">Sin ganancia neta este mes</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className="text-xs text-muted-foreground">% de ganancia</p>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={socio.porcentaje}
                            onChange={e => handlePorcentaje(idx, e.target.value)}
                            className="w-16 h-8 text-sm text-center"
                          />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          de {formatMoney(Math.max(0, ganancia))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Los porcentajes se suman al 100%. Basado en la ganancia NETA del mes (después de gastos empresariales).
          </p>
        </div>
      )}

      {/* Dialog: transferencia / aporte / retiro */}
      <Dialog open={transferDialog} onOpenChange={setTransferDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {transferForm.desde === "externo" ? "Aporte de capital" :
               transferForm.hacia === "externo" ? "Retiro de capital" :
               "Transferencia entre billeteras"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitTransfer} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Desde</Label>
                <select
                  value={transferForm.desde}
                  onChange={(e) => setTransferForm({ ...transferForm, desde: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="empresarial">Empresarial</option>
                  <option value="fabricacion">Fabricación</option>
                  <option value="externo">Externo (aporte)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Hacia</Label>
                <select
                  value={transferForm.hacia}
                  onChange={(e) => setTransferForm({ ...transferForm, hacia: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="fabricacion">Fabricación</option>
                  <option value="empresarial">Empresarial</option>
                  <option value="externo">Externo (retiro)</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Monto *</Label>
              <Input
                type="number"
                step="1"
                value={transferForm.monto}
                onChange={(e) => setTransferForm({ ...transferForm, monto: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={transferForm.fecha}
                onChange={(e) => setTransferForm({ ...transferForm, fecha: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={transferForm.descripcion}
                onChange={(e) => setTransferForm({ ...transferForm, descripcion: e.target.value })}
                placeholder="Motivo del movimiento"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTransferDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingTransfer}>
                {savingTransfer ? "Guardando..." : "Confirmar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: gasto Flex (pago a la logística) */}
      <Dialog open={flexDialog} onOpenChange={setFlexDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cargar pago Flex</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitFlexGasto} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Lo que le pagás a la logística por los envíos Flex. Se registra como gasto con categoría
              &quot;Flex&quot; y aparece en el card de arriba.
            </p>
            <div className="space-y-2">
              <Label>Monto *</Label>
              <Input
                type="number"
                step="1"
                value={flexForm.monto}
                onChange={(e) => setFlexForm({ ...flexForm, monto: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={flexForm.fecha}
                  onChange={(e) => setFlexForm({ ...flexForm, fecha: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Billetera</Label>
                <select
                  value={flexForm.billetera}
                  onChange={(e) => setFlexForm({ ...flexForm, billetera: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="empresarial">Empresarial</option>
                  <option value="fabricacion">Fabricación</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={flexForm.descripcion}
                onChange={(e) => setFlexForm({ ...flexForm, descripcion: e.target.value })}
                placeholder="Pago Flex logística"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setFlexDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={savingFlex}>
                {savingFlex ? "Guardando..." : "Registrar pago"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
