"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Megaphone, RefreshCw, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { parsePrice } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Reparto de la cuenta de Mercado Libre compartida con Shay Juguetes.
 *
 * Lo que se sabe de quién es se imputa directo: la comisión de cada venta y las
 * campañas de publicidad. Lo que no —percepciones, convenio, monotributo— se
 * carga una vez con el total del mes y se reparte según cuánto vendió cada uno.
 *
 * El cálculo de ventas va contra la API de ML y tarda unos segundos, así que se
 * guarda: la tarjeta lee el cierre guardado y sólo se recalcula a pedido.
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

interface GastosCompartidos {
  percepciones: number;
  iibb: number;
  monotributo: number;
  notas: string | null;
}

interface Cierre {
  socio: string;
  anio: number;
  mes: number;
  unidades: number;
  bruto: number;
  comision: number;
  neto: number;
  unidadesPropias: number;
  brutoPropio: number;
  netoPropio: number;
  proporcion: number;
  publicidad: number;
  compartidos: GastosCompartidos;
  parteCompartidos: number;
  aPasar: number;
  notas: string | null;
  pedidos: PedidoTercero[];
  calculadoEn: string;
}

interface Campana {
  id: number;
  nombre: string;
  estado: string;
  costo: number;
  clicks: number;
  impresiones: number;
}

type CampoCompartido = "percepciones" | "iibb" | "monotributo";

const COMPARTIDOS: Array<{ campo: CampoCompartido; label: string; ayuda: string }> = [
  { campo: "percepciones", label: "Percepciones", ayuda: "Percepciones de IVA / IIBB retenidas en el mes" },
  { campo: "iibb", label: "Convenio multilateral", ayuda: "IIBB convenio multilateral del mes" },
  { campo: "monotributo", label: "Monotributo", ayuda: "El monotributo del mes, completo" },
];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-AR");
const pct = (n: number) => (n * 100).toFixed(1).replace(".", ",") + "%";
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });

export function ShayCard({ mes, anio, nombreMes }: { mes: number; anio: number; nombreMes: string }) {
  // El período se guarda junto con los datos: así, al cambiar de mes, no se
  // muestran los números del mes anterior mientras llega la respuesta.
  const [cargado, setCargado] = useState<{
    periodo: string;
    cierre: Cierre | null;
    previo: (GastosCompartidos & { anio: number; mes: number }) | null;
  } | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<Partial<Record<CampoCompartido, string>>>({});

  // Publicidad: campañas de ML y cuáles son de Shay
  const [campanas, setCampanas] = useState<Campana[] | null>(null);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [panelAds, setPanelAds] = useState(false);
  const [adsMsg, setAdsMsg] = useState<string | null>(null);
  const [cargandoAds, setCargandoAds] = useState(false);

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
          setCampanas(null);
          setPanelAds(false);
        }
      } catch {
        if (vigente) setCargado({ periodo: clave, cierre: null, previo: null });
      }
    })();
    return () => {
      vigente = false;
    };
  }, [anio, mes]);

  const cierre = cargado?.periodo === periodo ? cargado.cierre : null;
  const cargando = cargado?.periodo !== periodo;
  const previo = cargado?.periodo === periodo ? cargado.previo : null;

  const totalCompartido = cierre
    ? cierre.compartidos.percepciones + cierre.compartidos.iibb + cierre.compartidos.monotributo
    : 0;

  const setCierre = (c: Cierre) => setCargado((prev) => (prev ? { ...prev, cierre: c } : prev));

  /* ── ventas ── */

  const recalcular = async () => {
    setCalculando(true);
    try {
      const res = await fetch("/api/finanzas/terceros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, mes }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error ?? "No se pudo calcular");
      else {
        setCierre(data.cierre);
        toast.success(`${nombreMes}: ${data.cierre.unidades} unidades, ${money(data.cierre.bruto)}`);
      }
    } catch {
      toast.error("No se pudo consultar Mercado Libre");
    }
    setCalculando(false);
  };

  /* ── gastos compartidos ── */

  const patchCompartidos = async (campos: Partial<Record<CampoCompartido, number>>) => {
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
      if (data.cierre) setCierre(data.cierre);
    } catch {
      toast.error("No se pudo guardar");
    }
  };

  const guardarCampo = async (campo: CampoCompartido) => {
    const crudo = borrador[campo];
    if (crudo === undefined || !cierre) return;
    const valor = parsePrice(crudo);
    setBorrador((b) => {
      const c = { ...b };
      delete c[campo];
      return c;
    });
    if (valor === cierre.compartidos[campo]) return;
    await patchCompartidos({ [campo]: valor });
  };

  const copiarPrevio = async () => {
    if (!previo) return;
    await patchCompartidos({
      percepciones: previo.percepciones,
      iibb: previo.iibb,
      monotributo: previo.monotributo,
    });
  };

  /* ── publicidad ── */

  const abrirCampanas = async () => {
    setPanelAds((v) => !v);
    if (campanas || cargandoAds) return;
    setCargandoAds(true);
    try {
      const res = await fetch(`/api/finanzas/terceros/publicidad?anio=${anio}&mes=${mes}`);
      const data = await res.json();
      if (!res.ok) setAdsMsg(data.error ?? "No se pudo consultar");
      else if (!data.disponible) setAdsMsg(data.motivo);
      else {
        setCampanas(data.campanas);
        setSeleccion(data.seleccionadas ?? []);
        setAdsMsg(null);
      }
    } catch {
      setAdsMsg("No se pudo consultar Mercado Libre");
    }
    setCargandoAds(false);
  };

  const aplicarCampanas = async () => {
    setCargandoAds(true);
    try {
      const res = await fetch("/api/finanzas/terceros/publicidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, mes, seleccionadas: seleccion }),
      });
      const data = await res.json();
      if (!res.ok) toast.error(data.error ?? "No se pudo guardar");
      else {
        setCierre(data.cierre);
        setCampanas(data.campanas);
        toast.success(`Publicidad de Shay: ${money(data.total)}`);
        setPanelAds(false);
      }
    } catch {
      toast.error("No se pudo guardar");
    }
    setCargandoAds(false);
  };

  /* ── planilla ── */

  const descargar = () => {
    if (!cierre) return;
    const sep = ";";
    const L: string[] = [];
    const fila = (a: string, b: number | string) => L.push([a, b].join(sep));

    L.push(`Shay Juguetes - ${nombreMes} ${anio}`);
    L.push("");
    fila("Unidades", cierre.unidades);
    fila("Bruto", Math.round(cierre.bruto));
    fila("Comision ML", Math.round(cierre.comision));
    fila("Neto", Math.round(cierre.neto));
    L.push("");
    fila("Publicidad (sus campanas)", Math.round(cierre.publicidad));
    fila("Percepciones del mes (total)", Math.round(cierre.compartidos.percepciones));
    fila("Convenio multilateral del mes (total)", Math.round(cierre.compartidos.iibb));
    fila("Monotributo del mes (total)", Math.round(cierre.compartidos.monotributo));
    fila("Proporcion de Shay sobre el neto", pct(cierre.proporcion));
    fila("Su parte de esos gastos", Math.round(cierre.parteCompartidos));
    L.push("");
    fila("A PASARLE", Math.round(cierre.aPasar));
    L.push("");
    L.push(
      ["Fecha", "N de venta", "ID de orden", "Publicacion", "MLA", "Comprador",
       "Cantidad", "Precio unitario", "Bruto", "Comision", "Neto", "Estado"].join(sep)
    );
    for (const p of cierre.pedidos) {
      L.push([
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
    const blob = new Blob([BOM + L.join("\n")], { type: "text/csv;charset=utf-8;" });
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
            <h2 className="text-sm font-semibold text-pink-600 dark:text-pink-400">Shay Juguetes</h2>
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
            <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={recalcular} disabled={calculando}>
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
          <p className="text-sm text-muted-foreground mt-2">No hubo ventas de Shay en {nombreMes}.</p>
        ) : (
          <>
            {/* Lo que vendió */}
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
                <p className="text-xl font-semibold tabular-nums">{money(cierre.neto)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {pct(cierre.proporcion)} del neto de la cuenta
                </p>
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

            {/* Publicidad: imputación directa, campaña por campaña */}
            <div className="mt-4 pt-3 border-t border-pink-500/20">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Publicidad de sus campañas</p>
                  <p className="text-lg font-semibold tabular-nums">−{money(cierre.publicidad)}</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 h-7" onClick={abrirCampanas}>
                  <Megaphone className="h-3.5 w-3.5" />
                  {panelAds ? "Cerrar" : "Elegir campañas"}
                </Button>
              </div>

              {panelAds && (
                <div className="mt-2 rounded-md border border-pink-500/20 p-2">
                  {cargandoAds && !campanas ? (
                    <p className="text-xs text-muted-foreground">Consultando Mercado Libre…</p>
                  ) : adsMsg ? (
                    <p className="text-xs text-amber-600 dark:text-amber-500">{adsMsg}</p>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground mb-1.5">
                        Tildá las campañas de Shay. La elección queda guardada para los meses
                        siguientes.
                      </p>
                      <div className="space-y-0.5">
                        {(campanas ?? []).map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 text-[12px] py-0.5 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-pink-500"
                              checked={seleccion.includes(c.id)}
                              onChange={(e) =>
                                setSeleccion((s) =>
                                  e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)
                                )
                              }
                            />
                            <span className="flex-1 truncate">{c.nombre}</span>
                            <span className="tabular-nums text-muted-foreground">{money(c.costo)}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border/50">
                        <span className="text-[11px] text-muted-foreground">
                          seleccionado:{" "}
                          <span className="font-medium text-foreground tabular-nums">
                            {money(
                              (campanas ?? [])
                                .filter((c) => seleccion.includes(c.id))
                                .reduce((a, c) => a + c.costo, 0)
                            )}
                          </span>
                        </span>
                        <Button size="sm" className="h-7" onClick={aplicarCampanas} disabled={cargandoAds}>
                          Guardar
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Gastos del mes: se cargan enteros y se reparten */}
            <div className="mt-4 pt-3 border-t border-pink-500/20">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Gastos del mes — total de la cuenta
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Se cargan enteros; a Shay le toca el {pct(cierre.proporcion)}, que es lo que vendió
                  </p>
                </div>
                {previo && totalCompartido === 0 && (
                  <button
                    className="text-[11px] text-pink-600 dark:text-pink-400 hover:underline"
                    onClick={copiarPrevio}
                  >
                    copiar los de {MESES_CORTOS[previo.mes - 1]} {previo.anio}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {COMPARTIDOS.map(({ campo, label, ayuda }) => {
                  const total = cierre.compartidos[campo];
                  return (
                    <div key={campo}>
                      <label className="text-[11px] text-muted-foreground block mb-1" title={ayuda}>
                        {label}
                      </label>
                      <Input
                        className="h-7 text-sm tabular-nums"
                        inputMode="decimal"
                        value={borrador[campo] ?? String(total || "")}
                        placeholder="0"
                        onChange={(e) => setBorrador((b) => ({ ...b, [campo]: e.target.value }))}
                        onBlur={() => guardarCampo(campo)}
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                        {total > 0 ? `le toca ${money(total * cierre.proporcion)}` : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* El número que importa */}
            <div className="flex items-baseline justify-between gap-3 mt-4 pt-3 border-t border-pink-500/20 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground">A pasarle</p>
                <p className="text-2xl font-bold tabular-nums text-pink-600 dark:text-pink-400">
                  {money(cierre.aPasar)}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground text-right">
                {money(cierre.neto)} neto
                {cierre.publicidad > 0 && <> − {money(cierre.publicidad)} publicidad</>}
                {cierre.parteCompartidos > 0 && <> − {money(cierre.parteCompartidos)} de gastos</>}
              </p>
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
                        <td className="py-1 pr-3 whitespace-nowrap">{fechaCorta(p.fecha)}</td>
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
              Calculado el{" "}
              {new Date(cierre.calculadoEn).toLocaleString("es-AR", {
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
