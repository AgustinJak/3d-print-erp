"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Boxes, Search, Printer, Check, AlertTriangle, Minus, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/data-loading";
import { useDatosEnVivo } from "@/hooks/use-datos-en-vivo";

interface UnidadStock {
  id: string;
  etiqueta: string;
  sku: string | null;
  categoria: string | null;
  categoriaColor: string | null;
  publicado: boolean;
  cantidad: number;
  reservado: number;
  disponible: number;
  minimo: number;
  falta: number;
  costoUnitario: number;
  costoFaltante: number;
  demandaMensual: number;
  cobertura: number | null;
  esperando: { unidades: number; pedidos: number } | null;
}

interface Aviso {
  tipo: string;
  etiqueta: string;
  pedido: string;
  unidades: number;
}

interface Resumen {
  unidadesDeStock: number;
  conObjetivo: number;
  enCero: number;
  unidadesAProducir: number;
  costoAProducir: number;
  unidadesEnStock: number;
  unidadesReservadas: number;
  comprometidoSinStock: number;
  pedidosEsperando: number;
  unidadesEsperadas: number;
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");

const TEXTO_AVISO: Record<string, string> = {
  falta_regla: "lleva funda pero no está definido cuál",
  combinacion_sin_fila: "esta combinación no tiene unidad de stock",
};

export default function StockPage() {
  const [stock, setStock] = useState<UnidadStock[]>([]);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [soloFaltantes, setSoloFaltantes] = useState(true);
  const [editando, setEditando] = useState<Record<string, string>>({});

  const fetchStock = useCallback(async () => {
    const res = await fetch("/api/stock");
    if (res.ok) {
      const data = await res.json();
      setStock(data.stock);
      setAvisos(data.avisos ?? []);
      setResumen(data.resumen);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStock(); }, [fetchStock]);
  // Se actualiza sola cuando entra un pedido o cambia el stock desde otro lado.
  useDatosEnVivo(fetchStock);

  const guardar = async (id: string, campo: "cantidad" | "minimo" | "delta", valor: number) => {
    const res = await fetch("/api/stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [campo]: valor }),
    });
    if (!res.ok) {
      toast.error("No se pudo guardar");
      return;
    }
    // El conteo se guarda siempre; lo que puede fallar es el reparto entre
    // pedidos. Se avisa en vez de dejarlo pasar: si no, el pedido seguiría
    // diciendo que falta stock que ya está.
    const data = await res.json().catch(() => null);
    if (data?.repartoError) {
      toast.warning("Se guardó el conteo, pero no se pudo repartir entre los pedidos");
    }
    fetchStock();
  };

  const visibles = stock.filter((s) => {
    if (soloFaltantes && s.falta === 0) return false;
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return s.etiqueta.toLowerCase().includes(q) || (s.sku ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Boxes className="h-6 w-6" /> Stock
          </h1>
          <p className="text-sm text-muted-foreground">
            Lo que tenés listo para despachar hoy, lo que ya tiene dueño, y lo que falta imprimir.
          </p>
        </div>
      </div>

      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">En stock</p>
            <p className="text-2xl font-semibold tabular-nums">{resumen.unidadesEnStock}</p>
            <p className="text-[11px] text-muted-foreground">
              {resumen.unidadesReservadas > 0
                ? `${resumen.unidadesReservadas} ya con dueño`
                : "unidades listas"}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Falta imprimir</p>
            <p className="text-2xl font-semibold tabular-nums text-amber-600">{resumen.unidadesAProducir}</p>
            <p className="text-[11px] text-muted-foreground">{money(resumen.costoAProducir)} de material</p>
          </Card>
          <Card className={`p-3 ${resumen.pedidosEsperando > 0 ? "border-red-500/40" : ""}`}>
            <p className="text-xs text-muted-foreground">Pedidos esperando</p>
            <p className="text-2xl font-semibold tabular-nums text-red-600">{resumen.pedidosEsperando}</p>
            <p className="text-[11px] text-muted-foreground">
              {resumen.unidadesEsperadas > 0 ? `${resumen.unidadesEsperadas} piezas a imprimir ya` : "nadie esperando"}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Sin disponible</p>
            <p className="text-2xl font-semibold tabular-nums">{resumen.enCero}</p>
            <p className="text-[11px] text-muted-foreground">productos sin nada libre</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Con objetivo</p>
            <p className="text-2xl font-semibold tabular-nums">{resumen.conObjetivo}</p>
            <p className="text-[11px] text-muted-foreground">de {resumen.unidadesDeStock} unidades de stock</p>
          </Card>
        </div>
      )}

      {avisos.length > 0 && (
        <Card className="p-3 border-amber-500/40 bg-amber-500/5">
          <p className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-500">
            <AlertTriangle className="h-4 w-4" />
            {avisos.length} {avisos.length === 1 ? "item de un pedido no se puede descontar" : "items de pedidos no se pueden descontar"}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground">
            {avisos.slice(0, 6).map((a, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{a.etiqueta}</span>
                {" — "}{TEXTO_AVISO[a.tipo] ?? a.tipo}
                <span className="opacity-70"> · pedido de {a.pedido}</span>
              </li>
            ))}
            {avisos.length > 6 && <li className="opacity-70">…y {avisos.length - 6} más</li>}
          </ul>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar producto o SKU…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <Button
          variant={soloFaltantes ? "default" : "outline"}
          onClick={() => setSoloFaltantes((v) => !v)}
        >
          <Printer className="h-4 w-4 mr-2" />
          {soloFaltantes ? "Mostrando lo que falta" : "Mostrando todo"}
        </Button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Vende</TableHead>
                  <TableHead className="text-center w-[150px]">Tengo</TableHead>
                  <TableHead className="text-center w-[110px]">Libre</TableHead>
                  <TableHead className="text-center w-[90px]">Objetivo</TableHead>
                  <TableHead className="text-right">Falta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((s) => (
                  <TableRow key={s.id} className={s.esperando ? "bg-red-500/5" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{s.etiqueta}</span>
                        {!s.publicado && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">sin publicar</Badge>
                        )}
                        {s.esperando && (
                          <Badge className="h-4 px-1.5 text-[10px] bg-red-500/15 text-red-600 border-red-500/30 hover:bg-red-500/20">
                            <Clock className="h-2.5 w-2.5 mr-1" />
                            {s.esperando.pedidos} {s.esperando.pedidos === 1 ? "pedido espera" : "pedidos esperan"} {s.esperando.unidades}
                          </Badge>
                        )}
                        {s.cantidad < 0 && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] border-red-500/40 text-red-600">
                            en negativo — falta contar
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.sku ?? "sin SKU"}
                        {s.categoria ? ` · ${s.categoria}` : ""}
                        {` · ${money(s.costoUnitario)} c/u`}
                      </div>
                    </TableCell>

                    <TableCell className="text-right tabular-nums text-sm">
                      {s.demandaMensual > 0 ? (
                        <>
                          {s.demandaMensual}<span className="text-muted-foreground text-[11px]">/mes</span>
                          {s.cobertura != null && s.disponible > 0 && (
                            <div className="text-[11px] text-muted-foreground">
                              alcanza {s.cobertura} {s.cobertura === 1 ? "mes" : "meses"}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => guardar(s.id, "delta", -1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className={`h-7 w-14 text-center tabular-nums ${s.cantidad < 0 ? "text-red-600 font-semibold" : ""}`}
                          value={editando[s.id] ?? String(s.cantidad)}
                          onChange={(e) => setEditando((p) => ({ ...p, [s.id]: e.target.value }))}
                          onBlur={() => {
                            const v = editando[s.id];
                            if (v !== undefined && v !== String(s.cantidad)) {
                              const n = parseInt(v, 10);
                              if (!Number.isNaN(n)) guardar(s.id, "cantidad", n);
                            }
                            setEditando((p) => { const c = { ...p }; delete c[s.id]; return c; });
                          }}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => guardar(s.id, "delta", 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>

                    {/* Lo que queda para prometerle a alguien nuevo. */}
                    <TableCell className="text-center tabular-nums">
                      <span className={`font-semibold ${s.disponible <= 0 ? "text-red-600" : ""}`}>
                        {s.disponible}
                      </span>
                      {s.reservado > 0 && (
                        <div className="text-[11px] text-muted-foreground">{s.reservado} reservadas</div>
                      )}
                    </TableCell>

                    <TableCell className="text-center">
                      <Input
                        className="h-7 w-14 mx-auto text-center tabular-nums"
                        defaultValue={s.minimo}
                        onBlur={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isNaN(n) && n !== s.minimo) guardar(s.id, "minimo", n);
                        }}
                      />
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {s.falta > 0 ? (
                        <>
                          <span className="font-semibold text-amber-600">{s.falta}</span>
                          <div className="text-[11px] text-muted-foreground">{money(s.costoFaltante)}</div>
                        </>
                      ) : (
                        <Check className="h-4 w-4 text-emerald-500 inline" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      {soloFaltantes ? "No falta imprimir nada 🎉" : "Sin resultados"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
