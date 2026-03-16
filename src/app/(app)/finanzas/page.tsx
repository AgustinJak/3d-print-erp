"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, ArrowLeft, ArrowRight, Wallet, Users, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/data-loading";

interface Socio {
  nombre: string;
  porcentaje: number;
}

interface FinanzasData {
  mes: {
    ingresos: number;
    costoFab: number;
    gastos: number;
    ganancia: number;
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
    disponible: number;
    mes: number;
  };
  gastosPorCategoria: Record<string, number>;
  datosMensuales: {
    mes: string;
    ingresos: number;
    costoFab: number;
    gastos: number;
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

export default function FinanzasPage() {
  const [data, setData] = useState<FinanzasData | null>(null);
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [initialLoading, setInitialLoading] = useState(true);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

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

  if (initialLoading) return <TableSkeleton cols={4} />;
  if (!data) return null;

  const maxGanancia = Math.max(...data.datosMensuales.map((d) => Math.max(d.ingresos, 1)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Finanzas</h1>
        <div className="flex items-center gap-2">
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

      {/* Billetera de Fabricación */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <Wallet className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-violet-500">Billetera de Fabricación</h2>
              <p className="text-xs text-muted-foreground">Dinero reservado para el negocio. Todos los gastos se descuentan de acá.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Disponible</p>
              <p className="text-2xl font-bold text-violet-500">{formatMoney(data.billeteraFab.disponible)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Acumulado total</p>
              <p className="text-lg font-semibold">{formatMoney(data.billeteraFab.acumulado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gastado en reinversión</p>
              <p className="text-lg font-semibold">{formatMoney(data.billeteraFab.gastado)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Aportado este mes</p>
              <p className="text-lg font-semibold">{formatMoney(data.billeteraFab.mes)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
              <p className="text-xs text-muted-foreground mt-1">
                Va a la billetera de fabricación
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Ganancia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${data.mes.ganancia >= 0 ? "text-green-600" : "text-red-500"}`}>
                {formatMoney(data.mes.ganancia)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Ingresos - Costo fabricación
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" /> Pedidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.mes.totalPedidos}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resumen anual */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Resumen anual ({anio})</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Ingresos</p>
              <p className="text-xl font-bold">{formatMoney(data.anio.ingresos)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Costo fabricación</p>
              <p className="text-xl font-bold">{formatMoney(data.anio.costoFab)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Ganancia</p>
              <p className={`text-xl font-bold ${data.anio.ganancia >= 0 ? "text-green-600" : "text-red-500"}`}>
                {formatMoney(data.anio.ganancia)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Pedidos</p>
              <p className="text-xl font-bold">{data.anio.totalPedidos}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Gráfico de barras simple */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingresos mensuales ({anio})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-60">
            {data.datosMensuales.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center">
                  {d.ingresos > 0 && (
                    <span className="text-xs text-muted-foreground mb-1">
                      ${(d.ingresos / 1000).toFixed(0)}k
                    </span>
                  )}
                  <div
                    className={`w-full rounded-t ${i + 1 === mes ? "bg-primary" : "bg-primary/30"}`}
                    style={{ height: `${Math.max((d.ingresos / maxGanancia) * 200, d.ingresos > 0 ? 4 : 0)}px` }}
                  />
                </div>
                <span className={`text-xs ${i + 1 === mes ? "font-bold" : "text-muted-foreground"}`}>
                  {d.mes}
                </span>
              </div>
            ))}
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
              const ganancia = data.mes.ganancia;
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
                          <p className="text-xs text-muted-foreground mt-1">Sin ganancia este mes</p>
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
            Los porcentajes se suman al 100%. Basado en la ganancia del mes seleccionado.
          </p>
        </div>
      )}
    </div>
  );
}
