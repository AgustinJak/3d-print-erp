"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft, ArrowRight, Wallet, Save, Download, Factory, Building2, ArrowRightLeft, Loader2, RefreshCw,
  PlusCircle, MinusCircle, Calendar, Trash2, Receipt, Package, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ESTADOS_PEDIDO } from "@/lib/constants";
import type { CargosDelMes } from "@/lib/resultado-mes";
import { ResultadoDelMes, textoDePeriodo } from "./resultado-del-mes";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableSkeleton } from "@/components/data-loading";
import { toast } from "sonner";

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
    cargosMl: CargosDelMes;
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
    cargosMl: number;
    compromisosFuturos: number;
    transferencias: number;
    disponible: number;
    mes: number;
  };
  ml: { leidoEn: string | null };
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
    cargosMl: number;
    neta: number;
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

  // Lo de abajo del resultado, de a una cosa por vez.
  const [seccion, setSeccion] = useState<"socios" | "anio" | "movimientos" | "gastos" | "curso">("socios");
  const [actualizando, setActualizando] = useState(false);

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

  /** Lee la facturación de ML. Va de a tandas: ML deja 5 pedidos por minuto. */
  const actualizarDeMl = async () => {
    setActualizando(true);
    try {
      for (let i = 0; i < 8; i++) {
        const r = await fetch("/api/finanzas/facturacion-ml", { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "No se pudo leer de ML");
        await fetchData();
        if (!d.quedan) {
          toast.success("Facturación de ML al día");
          return;
        }
      }
      toast.info("Sigue quedando por leer: volvé a tocar en un rato.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer de ML");
    } finally {
      setActualizando(false);
    }
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
    const ml = data.mes.cargosMl;
    lines.push(["Publicidad (con IVA, sin lo anulado)", ml.publicidad.total].join(sep));
    lines.push([`Percepciones (${ml.percepciones.estado}; período ${textoDePeriodo(ml.percepciones.periodo)})`, ml.percepciones.total].join(sep));
    lines.push(["Otros cargos de ML", ml.otros.total].join(sep));
    lines.push(["Lo que paga Shay", ml.shay.total].join(sep));
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
    lines.push(["Mes", "Cobrado", "Costo fab.", "Ganancia bruta", "Cargos de ML", "Gastos empresariales", "Ganancia neta"].join(sep));
    data.datosMensuales.forEach((d) => {
      lines.push([d.mes, d.ingresos, d.costoFab, d.ganancia, d.cargosMl, d.gastosEmp, d.neta].join(sep));
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
          <Button variant="outline" size="icon" onClick={prevMonth} title="Mes anterior">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {MESES[mes - 1]} <span className="font-bold">{anio}</span>
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth} title="Mes siguiente">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={actualizarDeMl} disabled={actualizando} className="gap-1.5" title={data.ml?.leidoEn ? `Última lectura: ${new Date(data.ml.leidoEn).toLocaleString("es-AR")}` : "Sin leer todavía"}>
            {actualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {actualizando ? "Leyendo…" : "Actualizar de ML"}
          </Button>
          <Button variant="outline" size="icon" onClick={exportarCSV} title="Exportar resumen">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
        <ResultadoDelMes
          nombreMes={MESES[mes - 1].toLowerCase()}
          cobrado={data.mes.ingresos}
          pedidos={data.mes.totalPedidos}
          costoFab={data.mes.costoFab}
          bruta={data.mes.ganancia}
          gastosEmp={data.mes.gastosEmp}
          gastosFab={data.mes.gastosFab}
          neta={data.mes.gananciaNeta}
          cargos={data.mes.cargosMl}
        />

        <Card>
          <CardContent className="pt-5 pb-4 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Billetera empresarial</p>
              <p className={`text-2xl font-bold tabular-nums mt-0.5 ${data.billeteraEmp.disponible >= 0 ? "" : "text-red-500"}`}>{formatMoney(data.billeteraEmp.disponible)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Entró {formatMoney(data.billeteraEmp.acumulado)} · salió {formatMoney(data.billeteraEmp.gastado)}</p>
              {data.billeteraEmp.cargosMl > 0 && <p className="text-xs text-muted-foreground">De lo que salió, {formatMoney(data.billeteraEmp.cargosMl)} son cargos de ML.</p>}
              {data.billeteraEmp.compromisosFuturos > 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Cuotas por venir: {formatMoney(data.billeteraEmp.compromisosFuturos)}</p>}
            </div>
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Factory className="h-3.5 w-3.5" /> Billetera de fabricación</p>
              <p className={`text-2xl font-bold tabular-nums mt-0.5 ${data.billeteraFab.disponible >= 0 ? "" : "text-red-500"}`}>{formatMoney(data.billeteraFab.disponible)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Entró {formatMoney(data.billeteraFab.acumulado)} · salió {formatMoney(data.billeteraFab.gastado)}</p>
              {data.billeteraFab.compromisosFuturos > 0 && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Cuotas por venir: {formatMoney(data.billeteraFab.compromisosFuturos)}</p>}
            </div>
            <div className="border-t pt-3 flex gap-1.5 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => openTransfer("transferir")} className="gap-1.5 flex-1"><ArrowRightLeft className="h-3.5 w-3.5" /> Transferir</Button>
              <Button variant="outline" size="sm" onClick={() => openTransfer("aporte")} className="gap-1.5 flex-1"><PlusCircle className="h-3.5 w-3.5" /> Aporte</Button>
              <Button variant="outline" size="sm" onClick={() => openTransfer("retiro")} className="gap-1.5 flex-1"><MinusCircle className="h-3.5 w-3.5" /> Retiro</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* El resto, de a una cosa por vez */}
      <div className="space-y-4">
        <div className="inline-flex rounded-md border text-sm overflow-hidden flex-wrap">
          {([
            ["socios", "Socios"],
            ["anio", `Año ${anio}`],
            ["movimientos", "Movimientos"],
            ["gastos", "Gastos y cuotas"],
            ["curso", "Pedidos en curso"],
          ] as const).map(([v, t], i) => (
            <button
              key={v}
              type="button"
              onClick={() => setSeccion(v)}
              className={`px-3 py-1.5 transition-colors ${seccion === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"} ${i > 0 ? "border-l" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>

        {seccion === "socios" && socios.length > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {data.mes.gananciaNeta > 0 ? `Se reparten ${formatMoney(data.mes.gananciaNeta)}, la ganancia neta de ${MESES[mes - 1].toLowerCase()}.` : `${MESES[mes - 1]} no tiene ganancia neta para repartir.`}
                </p>
                {configDirty && (
                  <Button size="sm" variant="outline" onClick={saveConfig} disabled={savingConfig} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {savingConfig ? "Guardando..." : "Guardar porcentajes"}
                  </Button>
                )}
              </div>
              <div className="divide-y">
                {socios.map((socio, idx) => {
                  const ganancia = data.mes.gananciaNeta;
                  const sueldo = ganancia > 0 ? ganancia * (socio.porcentaje / 100) : 0;
                  return (
                    <div key={idx} className="flex items-center justify-between gap-3 py-2 flex-wrap">
                      <span className="font-medium min-w-0 truncate">{socio.nombre}</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={socio.porcentaje}
                            onChange={(e) => handlePorcentaje(idx, e.target.value)}
                            className="w-16 h-8 text-sm text-center"
                            aria-label={`Porcentaje de ${socio.nombre}`}
                          />
                          %
                        </label>
                        <span className="text-lg font-semibold tabular-nums w-28 text-right">{formatMoney(sueldo)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {seccion === "anio" && (
          <Card>
            <CardContent className="pt-4 pb-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground text-right">
                    <th className="text-left font-normal pb-2">Mes</th>
                    <th className="font-normal pb-2">Cobrado</th>
                    <th className="font-normal pb-2">Bruta</th>
                    <th className="font-normal pb-2">Cargos de ML</th>
                    <th className="font-normal pb-2">Gastos empr.</th>
                    <th className="font-normal pb-2">Neta</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-right">
                  {data.datosMensuales.map((d, i) => (
                    <tr key={i} className={`border-t ${i + 1 === mes ? "bg-muted/40 font-medium" : ""}`}>
                      <td className="text-left py-1.5 capitalize">{d.mes}</td>
                      <td>{formatMoney(d.ingresos)}</td>
                      <td>{formatMoney(d.ganancia)}</td>
                      <td>{formatMoney(d.cargosMl)}</td>
                      <td>{formatMoney(d.gastosEmp)}</td>
                      <td className={d.neta < 0 ? "text-red-500" : ""}>{formatMoney(d.neta)}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="text-left py-2">Total</td>
                    <td>{formatMoney(data.datosMensuales.reduce((s, d) => s + d.ingresos, 0))}</td>
                    <td>{formatMoney(data.datosMensuales.reduce((s, d) => s + d.ganancia, 0))}</td>
                    <td>{formatMoney(data.datosMensuales.reduce((s, d) => s + d.cargosMl, 0))}</td>
                    <td>{formatMoney(data.datosMensuales.reduce((s, d) => s + d.gastosEmp, 0))}</td>
                    <td>{formatMoney(data.datosMensuales.reduce((s, d) => s + d.neta, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {seccion === "movimientos" && (
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-md border text-xs overflow-hidden">
                  {([
                    { val: "todos", label: "Todos" },
                    { val: "gasto", label: "Gastos" },
                    { val: "cuota", label: "Cuotas" },
                    { val: "transferencia", label: "Transferencias" },
                    { val: "pedido", label: "Pedidos" },
                  ] as const).map((e, i) => (
                    <button
                      key={e.val}
                      type="button"
                      onClick={() => setTipoFiltro(e.val)}
                      className={`px-2 h-7 transition-colors ${tipoFiltro === e.val ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"} ${i > 0 ? "border-l" : ""}`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-md border text-xs overflow-hidden">
                  {([
                    { val: "todas", label: "Las dos billeteras" },
                    { val: "fabricacion", label: "Fabricación" },
                    { val: "empresarial", label: "Empresarial" },
                  ] as const).map((e, i) => (
                    <button
                      key={e.val}
                      type="button"
                      onClick={() => setBilleteraFiltro(e.val)}
                      className={`px-2 h-7 transition-colors ${billeteraFiltro === e.val ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"} ${i > 0 ? "border-l" : ""}`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
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
                      <div key={m.id} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                        <config.Icon className={`h-4 w-4 shrink-0 ${config.iconClass}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{m.descripcion}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(m.fecha).toLocaleDateString("es-AR")}
                            {m.meta?.categoria ? ` · ${m.meta.categoria}` : ""}
                            {m.tipo === "cuota" && m.meta?.cuotaNumero ? ` · cuota ${m.meta.cuotaNumero}/${m.meta.cuotaTotal}` : ""}
                            {m.tipo === "transferencia" && m.meta?.desde ? ` · ${labelBilletera(m.meta.desde)} → ${labelBilletera(m.meta.hacia!)}` : ""}
                            {m.tipo !== "transferencia" && m.tipo !== "aporte" && m.tipo !== "retiro" && m.billetera !== "ambos" ? ` · ${labelBilletera(m.billetera)}` : ""}
                          </p>
                        </div>
                        <p className={`text-sm font-medium tabular-nums shrink-0 ${m.tipo === "pedido" ? "text-emerald-500" : ""}`}>
                          {config.sign}
                          {formatMoney(m.monto)}
                        </p>
                        {(m.tipo === "transferencia" || m.tipo === "aporte" || m.tipo === "retiro") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => deleteTransfer(m.id.replace(/^t-/, ""))} title="Eliminar movimiento">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                {data.movimientos.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Sin movimientos este mes.</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {seccion === "gastos" && (
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Card>
              <CardContent className="pt-4 pb-4 space-y-2">
                <p className="text-sm font-medium">Gastos cargados en {MESES[mes - 1].toLowerCase()}</p>
                {Object.keys(data.gastosPorCategoria).length === 0 && <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>}
                {Object.entries(data.gastosPorCategoria)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, monto]) => (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <span>{cat}</span>
                      <span className="tabular-nums">{formatMoney(monto)}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-sm font-medium">Cuotas en curso</p>
                {data.cuotasEnCurso.length === 0 && <p className="text-sm text-muted-foreground">Sin cuotas en curso.</p>}
                {data.cuotasEnCurso.map((c) => (
                  <div key={c.grupoCuotasId} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{c.descripcion || c.categoria}</span>
                      <span className="tabular-nums shrink-0">{formatMoney(c.montoCuota)}/cuota</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${c.cuotaTotal > 0 ? (c.pagadas / c.cuotaTotal) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.pagadas}/{c.cuotaTotal} pagadas
                      {c.proximaCuotaFecha ? ` · próxima el ${new Date(c.proximaCuotaFecha).toLocaleDateString("es-AR")}` : ""}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {seccion === "curso" && (
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Card>
              <CardContent className="pt-4 pb-4 space-y-2">
                <p className="text-sm font-medium">{data.pedidosEnCurso.cantidad} {data.pedidosEnCurso.cantidad === 1 ? "pedido en curso" : "pedidos en curso"}</p>
                <div className="flex items-center justify-between text-sm"><span>A cobrar</span><span className="tabular-nums font-semibold">{formatMoney(data.pedidosEnCurso.total)}</span></div>
                <div className="flex items-center justify-between text-sm"><span>Ya cobrado en señas</span><span className="tabular-nums">{formatMoney(data.pedidosEnCurso.cobrado)}</span></div>
                <div className="flex items-center justify-between text-sm"><span>Costo de fabricación</span><span className="tabular-nums">{formatMoney(data.pedidosEnCurso.costoFab)}</span></div>
                <div className="flex items-center justify-between text-sm"><span>Ganancia bruta proyectada</span><span className="tabular-nums">{formatMoney(data.pedidosEnCurso.ganancia)}</span></div>
                <div className="border-t pt-2 space-y-1">
                  {Object.entries(data.pedidosEnCurso.porEstado).map(([estado, info]) => (
                    <div key={estado} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{ESTADOS_PEDIDO[estado as keyof typeof ESTADOS_PEDIDO]?.label ?? estado} ({info.cantidad})</span>
                      <span className="tabular-nums">{formatMoney(info.total)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Flex en {MESES[mes - 1].toLowerCase()}</p>
                  <Button size="sm" variant="outline" onClick={openFlexGasto} className="gap-1.5"><PlusCircle className="h-3.5 w-3.5" /> Cargar pago</Button>
                </div>
                <div className="flex items-center justify-between text-sm"><span>Bonificado por ML</span><span className="tabular-nums">{formatMoney(data.flex.bonificado)}</span></div>
                <div className="flex items-center justify-between text-sm"><span>Pagado a la logística</span><span className="tabular-nums">{formatMoney(data.flex.pagadoLogistica)}</span></div>
                <div className="flex items-center justify-between text-sm font-medium border-t pt-2"><span>Sobrante</span><span className={`tabular-nums ${data.flex.sobrante < 0 ? "text-red-500" : ""}`}>{formatMoney(data.flex.sobrante)}</span></div>
                <p className="text-xs text-muted-foreground">Es informativo: no suma a las billeteras.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

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
