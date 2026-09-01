"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { parsePrice } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Ventas de Shay Juguetes en la cuenta de Mercado Libre compartida.
 *
 * Son las publicaciones marcadas "ignorar": no generan pedido en el ERP, pero
 * la plata entra a la misma cuenta y hay que pasársela. Se muestra el bruto (lo
 * que pagó el comprador) y el neto después de la comisión de ML, con el detalle
 * pedido por pedido para poder cruzarlo.
 *
 * El cálculo va contra la API de ML y tarda unos segundos, así que se guarda:
 * la tarjeta lee el cierre guardado y sólo se recalcula a pedido.
 */

interface PedidoTercero {
  idMl: string;
  packId: string | null;
  fecha: string;
  estado: string;
  mla: string;
  titulo: string;
  cantidad: number;
  precioUnitario: number;
  bruto: number;
  comision: number;
  neto: number;
  comprador: string | null;
}

interface Descuentos {
  publicidad: number;
  percepciones: number;
  iibb: number;
  monotributo: number;
}

interface Cierre extends Descuentos {
  socio: string;
  anio: number;
  mes: number;
  unidades: number;
  bruto: number;
  comision: number;
  neto: number;   // bruto - comisión de ML
  aPasar: number; // neto - descuentos
  notas: string | null;
  pedidos: PedidoTercero[];
  calculadoEn: string;
}

type Previo = Descuentos & { anio: number; mes: number };

const CAMPOS = [
  { campo: "publicidad" as const, label: "Publicidad", ayuda: "Campañas de Mercado Libre del mes" },
  { campo: "percepciones" as const, label: "Percepciones", ayuda: "Percepciones de IVA / IIBB retenidas" },
  { campo: "iibb" as const, label: "Convenio multilateral", ayuda: "Su parte de IIBB convenio multilateral" },
  { campo: "monotributo" as const, label: "Monotributo", ayuda: "Su parte del monotributo del mes" },
];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type CampoDescuento = (typeof CAMPOS)[number]["campo"];

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

export function ShayCard({ mes, anio, nombreMes }: { mes: number; anio: number; nombreMes: string }) {
  // Se guarda junto con el mes que se leyó: así, al cambiar de mes, no se
  // muestran los números del mes anterior mientras llega la respuesta.
  const [cargado, setCargado] = useState<{
    periodo: string;
    cierre: Cierre | null;
    previo: Previo | null;
  } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const periodo = `${anio}-${mes}`;

  useEffect(() => {
    let vigente = true;
    (async () => {
      const clave = `${anio}-${mes}`;
      try {
        const res = await fetch(`/api/finanzas/terceros?anio=${anio}&mes=${mes}`);
        const data = await res.json();
        if (vigente) {
          setCargado({
            periodo: clave,
            cierre: res.ok ? data.cierre : null,
            previo: res.ok ? (data.previo ?? null) : null,
          });
        }
      } catch {
        if (vigente) setCargado({ periodo: clave, cierre: null, previo: null });
      }
    })();
    return () => {
      vigente = false;
    };
  }, [anio, mes]);

  const [borrador, setBorrador] = useState<Partial<Record<CampoDescuento, string>>>({});

  const cierre = cargado?.periodo === periodo ? cargado.cierre : null;
  const cargando = cargado?.periodo !== periodo;
  const previo = cargado?.periodo === periodo ? cargado.previo : null;

  const descuentoTotal = cierre
    ? cierre.publicidad + cierre.percepciones + cierre.iibb + cierre.monotributo
    : 0;
  const sinDescuentos = descuentoTotal === 0;

  /** Guarda un solo campo al salir del input. Los otros quedan como están. */
  const guardarCampo = async (campo: CampoDescuento) => {
    const crudo = borrador[campo];
    if (crudo === undefined || !cierre) return;
    const valor = parsePrice(crudo);
    setBorrador((b) => {
      const c = { ...b };
      delete c[campo];
      return c;
    });
    if (valor === cierre[campo]) return;
    await patch({ [campo]: valor });
  };

  const copiarPrevio = async () => {
    if (!previo) return;
    await patch({
      publicidad: previo.publicidad,
      percepciones: previo.percepciones,
      iibb: previo.iibb,
      monotributo: previo.monotributo,
    });
  };

  const patch = async (campos: Record<string, number>) => {
    try {
      const res = await fetch("/api/finanzas/terceros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, mes, ...campos }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar");
        return;
      }
      setCargado((c) => (c ? { ...c, cierre: data.cierre } : c));
    } catch {
      toast.error("No se pudo guardar");
    }
  };

  const calcular = async () => {
    setCalculando(true);
    try {
      const res = await fetch("/api/finanzas/terceros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, mes }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo calcular");
      } else {
        setCargado((c) => ({ periodo, cierre: data.cierre, previo: c?.previo ?? null }));
        toast.success(`${nombreMes}: ${data.cierre.unidades} unidades, ${money(data.cierre.bruto)}`);
      }
    } catch {
      toast.error("No se pudo consultar Mercado Libre");
    }
    setCalculando(false);
  };

  const descargar = () => {
    if (!cierre) return;
    const sep = ";";
    const lines: string[] = [];
    lines.push(`Ventas Shay Juguetes - ${nombreMes} ${anio}`);
    lines.push("");
    lines.push(["Unidades", cierre.unidades].join(sep));
    lines.push(["Bruto", Math.round(cierre.bruto)].join(sep));
    lines.push(["Comision ML", Math.round(cierre.comision)].join(sep));
    lines.push(["Neto de ML", Math.round(cierre.neto)].join(sep));
    lines.push(["Publicidad", Math.round(cierre.publicidad)].join(sep));
    lines.push(["Percepciones", Math.round(cierre.percepciones)].join(sep));
    lines.push(["Convenio multilateral", Math.round(cierre.iibb)].join(sep));
    lines.push(["Monotributo", Math.round(cierre.monotributo)].join(sep));
    lines.push(["A PASARLE", Math.round(cierre.aPasar)].join(sep));
    lines.push("");
    lines.push(
      ["Fecha", "N de venta", "ID de orden", "Publicacion", "MLA", "Comprador",
       "Cantidad", "Precio unitario", "Bruto", "Comision", "Neto", "Estado"].join(sep)
    );
    for (const p of cierre.pedidos) {
      lines.push([
        new Date(p.fecha).toLocaleDateString("es-AR"),
        p.packId ?? p.idMl,
        p.idMl,
        // El punto y coma es el separador: si aparece en el título rompe la columna.
        p.titulo.replace(/;/g, ","),
        p.mla,
        p.comprador ?? "",
        p.cantidad,
        Math.round(p.precioUnitario),
        Math.round(p.bruto),
        Math.round(p.comision),
        Math.round(p.neto),
        p.estado,
      ].join(sep));
    }

    const BOM = "﻿";
    const blob = new Blob([BOM + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shay_juguetes_${nombreMes.toLowerCase()}_${anio}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (cargando) return null;

  return (
    <Card className="border-pink-500/30 bg-pink-500/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-pink-500" />
            <h2 className="text-sm font-semibold text-pink-600 dark:text-pink-400">
              Shay Juguetes
            </h2>
            <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
              plata a pasarle
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {cierre && (
              <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={descargar}>
                <Download className="h-3.5 w-3.5" /> Descargar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7"
              onClick={calcular}
              disabled={calculando}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${calculando ? "animate-spin" : ""}`} />
              {calculando ? "Consultando ML…" : cierre ? "Recalcular" : "Calcular"}
            </Button>
          </div>
        </div>

        {!cierre ? (
          <p className="text-sm text-muted-foreground mt-2">
            Sin calcular. Se consulta a Mercado Libre y tarda unos segundos.
          </p>
        ) : cierre.unidades === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">
            No hubo ventas de Shay en {nombreMes}.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div>
                <p className="text-xs text-muted-foreground">Bruto</p>
                <p className="text-xl font-semibold tabular-nums">{money(cierre.bruto)}</p>
                <p className="text-[11px] text-muted-foreground">{cierre.unidades} unidades</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comisión de ML</p>
                <p className="text-xl font-semibold tabular-nums text-muted-foreground">
                  −{money(cierre.comision)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Neto</p>
                <p className="text-xl font-semibold tabular-nums text-pink-600 dark:text-pink-400">
                  {money(cierre.neto)}
                </p>
                <p className="text-[11px] text-muted-foreground">después de comisión</p>
              </div>
              <div className="flex items-end">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={() => setAbierto((v) => !v)}
                >
                  {abierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {cierre.pedidos.length} {cierre.pedidos.length === 1 ? "venta" : "ventas"}
                </button>
              </div>
            </div>

            {/* Lo que se le descuenta de su parte */}
            <div className="mt-4 pt-3 border-t border-pink-500/20">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Descuentos sobre su parte
                </p>
                {previo && sinDescuentos && (
                  <button
                    className="text-[11px] text-pink-600 dark:text-pink-400 hover:underline"
                    onClick={copiarPrevio}
                  >
                    copiar los de {MESES_CORTOS[previo.mes - 1]} {previo.anio}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {CAMPOS.map(({ campo, label, ayuda }) => (
                  <div key={campo}>
                    <label className="text-[11px] text-muted-foreground block mb-1" title={ayuda}>
                      {label}
                    </label>
                    <Input
                      className="h-7 text-sm tabular-nums"
                      inputMode="decimal"
                      value={borrador[campo] ?? String(cierre[campo] || "")}
                      placeholder="0"
                      onChange={(e) => setBorrador((b) => ({ ...b, [campo]: e.target.value }))}
                      onBlur={() => guardarCampo(campo)}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-baseline justify-between gap-3 mt-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">A pasarle</p>
                  <p className="text-2xl font-bold tabular-nums text-pink-600 dark:text-pink-400">
                    {money(cierre.aPasar)}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground text-right">
                  {money(cierre.neto)} neto
                  {descuentoTotal > 0 && <> − {money(descuentoTotal)} de descuentos</>}
                </p>
              </div>
            </div>

            {abierto && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left font-normal py-1 pr-3">Fecha</th>
                      <th className="text-left font-normal py-1 pr-3">N.º de venta</th>
                      <th className="text-left font-normal py-1 pr-3">Publicación</th>
                      <th className="text-right font-normal py-1 pr-3">Cant.</th>
                      <th className="text-right font-normal py-1 pr-3">Bruto</th>
                      <th className="text-right font-normal py-1 pr-3">Comisión</th>
                      <th className="text-right font-normal py-1">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cierre.pedidos.map((p, i) => (
                      <tr key={`${p.idMl}-${p.mla}-${i}`} className="border-b border-border/40">
                        <td className="py-1 pr-3 whitespace-nowrap">{fecha(p.fecha)}</td>
                        <td className="py-1 pr-3 font-mono text-[11px]">
                          <span className="select-all">{p.packId ?? p.idMl}</span>
                          {p.packId && p.packId !== p.idMl && (
                            <span className="block text-[10px] text-muted-foreground">
                              orden <span className="select-all">{p.idMl}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-3">
                          <span className="block max-w-[280px] truncate" title={p.titulo}>{p.titulo}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{p.mla}</span>
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">{p.cantidad}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{money(p.bruto)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                          −{money(p.comision)}
                        </td>
                        <td className="py-1 text-right tabular-nums font-medium">{money(p.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-2">
              Calculado el {new Date(cierre.calculadoEn).toLocaleString("es-AR", {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
              })}
              {" · "}no incluye envíos ni ventas canceladas
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
