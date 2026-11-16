"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cotizar } from "@/lib/cotizador";
import type { ParametrosCosto } from "@/lib/costos-formula";
import type { GastosVenta, Redondeo } from "@/lib/precios-formula";
import { parsePrice } from "@/lib/utils";

/**
 * Cotizador rápido (docs/sdd/013): gramos, tiempo, material e insumos, y al instante el costo de
 * fabricación (la fórmula de Bodega) y el precio de Mercado Libre, la web y la venta directa con el
 * margen del ERP. No guarda nada: es para responder "¿cuánto sale?" sin crear el producto.
 */

interface Datos {
  parametros: ParametrosCosto;
  materiales: Array<{ id: string; nombre: string; precioKg: number | null; porDefecto: boolean }>;
  gastos: GastosVenta;
  redondeo: Redondeo;
}

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const num = (s: string) => (s.trim() ? parsePrice(s) : 0);

function Campo({ label, children, ayuda }: { label: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
      {ayuda && <span className="block text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  );
}

export default function CotizadorPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [nombre, setNombre] = useState("");
  const [gramos, setGramos] = useState("");
  const [horas, setHoras] = useState("");
  const [minutos, setMinutos] = useState("");
  const [material, setMaterial] = useState("");
  const [insumos, setInsumos] = useState("");
  const [margen, setMargen] = useState("");
  const [cantidad, setCantidad] = useState("1");

  useEffect(() => {
    fetch("/api/cotizador")
      .then((r) => r.json())
      .then((d: Datos) => {
        setDatos(d);
        setMaterial(d.materiales.find((m) => m.porDefecto)?.id ?? d.materiales[0]?.id ?? "");
      })
      .catch(() => toast.error("No se pudo leer la configuración"));
  }, []);

  const precioKg = datos?.materiales.find((m) => m.id === material)?.precioKg ?? null;
  const c = useMemo(
    () =>
      datos
        ? cotizar({ gramos: num(gramos), minutos: num(horas) * 60 + num(minutos), precioKg, insumos: num(insumos), margen: margen.trim() ? num(margen) : null }, datos.parametros, datos.gastos, datos.redondeo)
        : null,
    [datos, gramos, horas, minutos, precioKg, insumos, margen]
  );
  const unidades = Math.max(1, Math.round(num(cantidad)) || 1);
  const hayDatos = !!c && c.costo > 0;
  const margenObjetivo = margen.trim() ? num(margen) : (datos?.gastos.margenMinorista ?? 35);

  const limpiar = () => {
    setNombre("");
    setGramos("");
    setHoras("");
    setMinutos("");
    setInsumos("");
    setMargen("");
    setCantidad("1");
  };

  const copiar = async () => {
    if (!c) return;
    const lineas = [
      nombre.trim() || "Cotización",
      unidades > 1 ? `${unidades} unidades` : null,
      ...c.canales.filter((k) => k.precio > 0).map((k) => `${k.nombre}: ${money(k.precio)}${unidades > 1 ? ` c/u · ${money(k.precio * unidades)} total` : ""}`),
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lineas.join("\n"));
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <motion.div className="mx-auto max-w-[1200px] space-y-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[1.15] font-medium">Cotizador</h1>
          <p className="text-sm text-muted-foreground">Cuánto sale una pieza, sin crear el producto. No se guarda nada.</p>
        </div>
        <Button variant="ghost" className="text-muted-foreground" onClick={limpiar}>
          <RotateCcw className="h-4 w-4" strokeWidth={1.5} /> Empezar de nuevo
        </Button>
      </div>

      {!datos ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {/* Lo que se carga */}
          <section className="space-y-5 rounded-xl border bg-card p-6">
            <Campo label="Qué es (opcional)">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Llavero con logo, pedido de Juan" />
            </Campo>
            <div className="grid grid-cols-3 gap-3">
              <Campo label="Gramos">
                <Input value={gramos} onChange={(e) => setGramos(e.target.value)} inputMode="decimal" placeholder="0" autoFocus />
              </Campo>
              <Campo label="Horas">
                <Input value={horas} onChange={(e) => setHoras(e.target.value)} inputMode="decimal" placeholder="0" />
              </Campo>
              <Campo label="Minutos">
                <Input value={minutos} onChange={(e) => setMinutos(e.target.value)} inputMode="decimal" placeholder="0" />
              </Campo>
            </div>
            <Campo label="Material">
              <select value={material} onChange={(e) => setMaterial(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
                {datos.materiales.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} · {money(m.precioKg ?? datos.parametros.precioKg)} el kilo
                  </option>
                ))}
                {datos.materiales.length === 0 && <option value="">{money(datos.parametros.precioKg)} el kilo</option>}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Insumos por unidad" ayuda="Imanes, cadena, caja…">
                <Input value={insumos} onChange={(e) => setInsumos(e.target.value)} inputMode="decimal" placeholder="$ 0" />
              </Campo>
              <Campo label="Margen" ayuda={`Vacío: el de Precios, ${datos.gastos.margenMinorista} %`}>
                <Input value={margen} onChange={(e) => setMargen(e.target.value)} inputMode="decimal" placeholder={`${datos.gastos.margenMinorista} %`} />
              </Campo>
            </div>
            <Campo label="Unidades">
              <Input value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputMode="numeric" className="w-28" />
            </Campo>
            <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
              Luz {money(datos.parametros.precioKwh)} el kWh a {datos.parametros.consumoW} W, desgaste {money(datos.parametros.precioRepuestos)} cada {datos.parametros.desgasteHoras} h y{" "}
              {datos.parametros.margenError} % por fallas: los parámetros de Bodega.
            </p>
          </section>

          {/* El resultado */}
          <section className="space-y-4">
            <div className="rounded-xl border bg-card p-6">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm text-muted-foreground">Costo por unidad</p>
                <p className="font-mono text-2xl font-medium tabular-nums">{money(c?.costo ?? 0)}</p>
              </div>
              {hayDatos && c && (
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t pt-4 text-[13px] sm:grid-cols-3">
                  {(
                    [
                      ["Material", c.fabricacion.material],
                      ["Luz", c.fabricacion.luz],
                      ["Desgaste", c.fabricacion.desgaste],
                      [`Fallas (${datos.parametros.margenError} %)`, c.fabricacion.margenError],
                      ["Insumos", c.insumos],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-mono tabular-nums">{money(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {!hayDatos ? (
              <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Cargá los gramos y el tiempo para ver los precios</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {c!.canales.map((k, i) => {
                    const bajo = k.margen < margenObjetivo - 0.5;
                    return (
                      <div key={k.canal} className={`rounded-xl border bg-card p-5 ${i === 0 ? "ring-1 ring-primary/30" : ""}`}>
                        <p className="text-sm text-muted-foreground">{k.nombre}</p>
                        <p className={`mt-1 font-mono text-[26px] leading-none font-medium tabular-nums ${i === 0 ? "text-primary" : ""}`}>{money(k.precio)}</p>
                        {k.publicado !== k.precio && <p className="mt-1.5 text-xs text-muted-foreground">Publicar a {money(k.publicado)} (con la promo)</p>}
                        {unidades > 1 && <p className="mt-1.5 font-mono text-xs text-muted-foreground tabular-nums">{money(k.precio * unidades)} por {unidades}</p>}
                        <div className="mt-3 border-t pt-3 text-[13px]">
                          <p className="flex justify-between">
                            <span className="text-muted-foreground">Deja</span>
                            <span className="font-mono tabular-nums">{money(k.ganancia)}</span>
                          </p>
                          <p className="flex justify-between">
                            <span className="text-muted-foreground">Margen</span>
                            <span className={`font-mono tabular-nums ${bajo ? "text-amber-600 dark:text-amber-400" : ""}`}>{Math.round(k.margen)} %</span>
                          </p>
                          {bajo && k.canal !== "personalizado" && (
                            <p className="mt-1 text-xs leading-4 text-amber-600 dark:text-amber-400">
                              {k.gastos.some((x) => x.concepto.startsWith("Envío"))
                                ? "Incluye el envío gratis que pagás: gana lo mismo en pesos, por eso el % es menor"
                                : "Se queda justo abajo del envío gratis: cruzarlo dejaría menos"}
                            </p>
                          )}
                        </div>
                        {k.gastos.length > 0 && (
                          <details className="mt-2 text-xs text-muted-foreground">
                            <summary className="cursor-pointer select-none hover:text-foreground">Lo que se lleva cada uno</summary>
                            <dl className="mt-2 space-y-1">
                              {k.gastos.map((x) => (
                                <div key={x.concepto} className="flex justify-between gap-2">
                                  <dt>{x.concepto}</dt>
                                  <dd className="font-mono tabular-nums">{money(x.monto)}</dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={copiar}>
                    <Copy className="h-4 w-4" strokeWidth={1.5} /> Copiar los precios
                  </Button>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Mercado Libre con los gastos generales de Precios (comisión, cargo fijo, cuotas, publicidad, envío e IIBB). Una publicación real puede variar un poco según su categoría. La venta
                  directa va sin comisiones ni impuestos.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </motion.div>
  );
}
