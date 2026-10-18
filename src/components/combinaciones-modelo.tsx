"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Layers, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Las combinaciones vendibles de un modelo y lo que consume cada una
 * (docs/sdd/001, specs 001 y 006).
 *
 * Es donde se arma una katana nueva sin ayuda: "Agregar accesorio" crea "Con
 * Funda" y "Sin Funda", y en "Con Funda" se elige qué funda lleva. Hasta acá esa
 * receta se cargaba con scripts.
 */

interface Combinacion {
  id: string;
  sku: string | null;
  nombre: string;
  activo: boolean;
}

interface Componente {
  tipo: "producto" | "insumo";
  etiqueta: string;
  stockId: string | null;
  necesita: number;
  motivo?: string;
}

interface Receta {
  componentes: Componente[];
  propias: Array<{ stockId: string; cantidad: number }>;
  heredadas: number;
  pendiente: boolean;
}

interface Insumo {
  stockId: string;
  etiqueta: string;
  cantidad: number;
  costo: number | null;
}

const pesos = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

const selectClase =
  "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `error ${r.status}`);
  return data as T;
}

export function CombinacionesModelo({ modeloId, onCambio }: { modeloId: string; onCambio?: () => void }) {
  const [combinaciones, setCombinaciones] = useState<Combinacion[]>([]);
  const [recetas, setRecetas] = useState<Record<string, Receta>>({});
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [accesorio, setAccesorio] = useState<{ nombre: string; stockId: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [cs, ins] = await Promise.all([
        pedir<Combinacion[]>(`/api/combinaciones?modeloId=${modeloId}&todas=1`),
        pedir<Insumo[]>("/api/insumos"),
      ]);
      setCombinaciones(cs);
      setInsumos(ins);
      const rs = await Promise.all(cs.map((c) => pedir<Receta>(`/api/combinaciones/${c.id}/receta`).then((r) => [c.id, r] as const)));
      setRecetas(Object.fromEntries(rs));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cargar las combinaciones");
    } finally {
      setCargando(false);
    }
  }, [modeloId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function elegirInsumo(c: Combinacion, stockId: string) {
    setGuardando(c.id);
    try {
      const r = await pedir<{ costoAdicional: number | null }>(`/api/combinaciones/${c.id}/receta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insumos: stockId ? [{ stockId, cantidad: 1 }] : [] }),
      });
      toast.success(
        stockId
          ? `Receta guardada${r.costoAdicional != null ? ` · el adicional pasa a ${pesos(r.costoAdicional)}` : ""}`
          : "Insumo quitado"
      );
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(null);
    }
  }

  async function alternarActiva(c: Combinacion) {
    setGuardando(c.id);
    try {
      await pedir(`/api/combinaciones/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !c.activo }),
      });
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar");
    } finally {
      setGuardando(null);
    }
  }

  async function crearAccesorio() {
    if (!accesorio?.nombre.trim()) return;
    setGuardando("accesorio");
    try {
      await pedir(`/api/modelos/${modeloId}/accesorios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: accesorio.nombre, stockId: accesorio.stockId || null }),
      });
      toast.success(`Listo: "Con ${accesorio.nombre}" y "Sin ${accesorio.nombre}"`);
      setAccesorio(null);
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar");
    } finally {
      setGuardando(null);
    }
  }

  const opcionesInsumo = (
    <>
      <option value="">Sin insumo</option>
      {insumos.map((i) => (
        <option key={i.stockId} value={i.stockId}>
          {i.etiqueta} · stock {i.cantidad}
          {i.costo != null ? ` · ${pesos(i.costo)}` : ""}
        </option>
      ))}
    </>
  );

  const activas = combinaciones.filter((c) => c.activo);
  const pendientes = activas.filter((c) => recetas[c.id]?.pendiente).length;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Layers className="h-4 w-4" /> Combinaciones ({activas.length})
          {pendientes > 0 && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              {pendientes} sin insumo
            </Badge>
          )}
        </CardTitle>
        {!accesorio && (
          <Button size="sm" variant="outline" onClick={() => setAccesorio({ nombre: "Funda", stockId: "" })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar accesorio
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {accesorio && (
          <div className="rounded-md border border-dashed p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Crea &quot;Con {accesorio.nombre || "…"}&quot; y &quot;Sin {accesorio.nombre || "…"}&quot;. En &quot;Con&quot; se reserva
              y descuenta el insumo que elijas.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={accesorio.nombre}
                onChange={(e) => setAccesorio({ ...accesorio, nombre: e.target.value })}
                placeholder="Funda, Exhibidor…"
                className="h-8 w-40"
              />
              <select
                className={selectClase}
                value={accesorio.stockId}
                onChange={(e) => setAccesorio({ ...accesorio, stockId: e.target.value })}
              >
                {opcionesInsumo}
              </select>
              <Button size="sm" onClick={crearAccesorio} disabled={guardando === "accesorio" || !accesorio.nombre.trim()}>
                {guardando === "accesorio" ? "Creando…" : "Crear"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAccesorio(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!cargando && combinaciones.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no tiene combinaciones: se crean solas al sembrar el catálogo.</p>
        )}

        {combinaciones.map((c) => {
          const r = recetas[c.id];
          const insumoPropio = r?.propias.length === 1 ? r.propias[0].stockId : "";
          const varios = (r?.propias.length ?? 0) > 1;
          return (
            <div key={c.id} className={`rounded-md bg-muted/40 px-3 py-2 space-y-1.5 ${c.activo ? "" : "opacity-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.nombre}</p>
                  <p className="text-xs font-mono text-muted-foreground">{c.sku ?? "sin SKU: falta el del modelo"}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" disabled={guardando === c.id} onClick={() => alternarActiva(c)}>
                  {c.activo ? "Desactivar" : "Activar"}
                </Button>
              </div>

              {r && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Consume:</span>
                  {r.componentes.map((x, i) => (
                    <Badge key={i} variant={x.tipo === "insumo" ? "secondary" : "outline"} className="font-normal">
                      {x.tipo === "insumo" ? "+ " : ""}
                      {x.etiqueta}
                      {!x.stockId && x.motivo === "a_pedido" ? " (a pedido)" : ""}
                    </Badge>
                  ))}
                  {r.pendiente && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3 w-3" /> falta elegir el insumo
                    </span>
                  )}
                </div>
              )}

              {r && c.activo && !varios && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Insumo:</span>
                  <select
                    className={selectClase}
                    value={insumoPropio}
                    disabled={guardando === c.id}
                    onChange={(e) => elegirInsumo(c, e.target.value)}
                  >
                    {opcionesInsumo}
                  </select>
                  {r.heredadas > 0 && <span className="text-muted-foreground">+ {r.heredadas} del modelo</span>}
                </div>
              )}
              {varios && <p className="text-xs text-muted-foreground">Lleva {r!.propias.length} insumos: se editan de a uno desde la receta.</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
