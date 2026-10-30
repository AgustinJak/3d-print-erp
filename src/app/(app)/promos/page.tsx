"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, MoreHorizontal, Percent, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { ConfirmarPromos } from "@/components/promos/confirmar-promos";
import type { CambioDePromoRegistrado, CandidataCalculada, FilaPromo, ResumenPromos } from "@/lib/promos-ml";
import { conPrecio, nombreDeTipo, precioParaPct, type PedidoDePromo, type TipoDeAviso } from "@/lib/promos-ml-reglas";

/**
 * Promos de Mercado Libre (docs/sdd/006, spec 010): en qué promo está cada publicación, a cuáles se
 * puede sumar y cuánto deja a ese precio, avisos, y prender o cambiar promos en cantidad.
 *
 * El ERP nunca prende una promo solo: todo pasa por la vista previa y lo confirma Agustín.
 */

type Pestana = "avisos" | "campana" | "todas" | "historial";

const AVISOS: Record<TipoDeAviso, { texto: string; clase: string }> = {
  "sin-promo": { texto: "Sin campaña", clase: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30" },
  distinta: { texto: "% distinto", clase: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  "de-mas": { texto: "Promo de más", clase: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30" },
  vence: { texto: "Vence pronto", clase: "bg-muted text-muted-foreground" },
};

/** El buscador (Agustín, 2026-10-30): por producto o publicación, sin tildes ni mayúsculas. */
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const coincide = (f: FilaPromo, q: string) => !q.trim() || normal(`${f.producto} ${f.mla}`).includes(normal(q.trim()));

/** Las campañas propias se pueden cambiar de %; las de ML, no. */
const SE_CAMBIA = ["SELLER_CAMPAIGN", "PRICE_DISCOUNT"];

const linkMl = (mla: string) => `https://articulo.mercadolibre.com.ar/${mla.replace(/^MLA/, "MLA-")}`;
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" }) : "");

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

/* ───────────────────────── Piezas chicas ───────────────────────── */

function Tarjeta({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: "mal" }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4 space-y-1">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={`text-2xl font-semibold tabular-nums tracking-tight ${tono === "mal" ? "text-red-600 dark:text-red-400" : ""}`}>{valor}</p>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

function Producto({ f }: { f: FilaPromo }) {
  return (
    <div className="min-w-0">
      <p className="font-medium truncate">{f.producto}</p>
      <a href={linkMl(f.mla)} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
        {f.mla} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function Hoy({ f }: { f: FilaPromo }) {
  if (!f.activa) return <span className="text-muted-foreground">Sin promo · {pesos(f.publicado)}</span>;
  return (
    <span>
      <span className="font-medium">{f.activa.pct} %</span> en {f.activa.nombre || nombreDeTipo(f.activa.tipo)}
      <span className="text-muted-foreground"> · {pesos(f.activa.precio ?? f.publicado)}{f.activa.hasta ? ` · hasta el ${fecha(f.activa.hasta)}` : ""}</span>
    </span>
  );
}

function Deja({ ganancia, margen }: { ganancia: number | null; margen: number | null }) {
  if (ganancia == null) return <span className="text-muted-foreground" title="El producto no tiene costo en el ERP">—</span>;
  return (
    <span className={`tabular-nums ${ganancia < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
      {pesos(ganancia)} <span className="text-muted-foreground">({margen} %)</span>
    </span>
  );
}

/** El menú de una fila: sumar a una campaña, cambiar el % de la propia, sacar. */
function Acciones({ f, general, onPedir }: { f: FilaPromo; general: number; onPedir: (p: PedidoDePromo[], titulo: string) => void }) {
  const objetivo = f.esperada || general;
  const cambiable = f.activa && SE_CAMBIA.includes(f.activa.tipo) && f.activa.pct !== objetivo;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Acciones" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {cambiable && (
          <DropdownMenuItem
            onClick={() =>
              onPedir(
                [{ mla: f.mla, accion: "cambiar", promocionId: f.activa!.id, promocionTipo: f.activa!.tipo, precio: Math.round(f.publicado * (1 - objetivo / 100)) }],
                `Pasar ${f.producto} a ${objetivo} %`
              )
            }
          >
            Pasar a {objetivo} % en {f.activa!.nombre || nombreDeTipo(f.activa!.tipo)} ({pesos(Math.round(f.publicado * (1 - objetivo / 100)))})
          </DropdownMenuItem>
        )}
        {f.candidatas.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">Sumar a…</DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
        {f.candidatas.map((c) => (
          <DropdownMenuItem
            key={`${c.tipo}-${c.id}`}
            onClick={() => onPedir([{ mla: f.mla, accion: "sumar", promocionId: c.id, promocionTipo: c.tipo, precio: c.propuesta.precio }], `Sumar ${f.producto} a ${c.nombre || nombreDeTipo(c.tipo)}`)}
            className="flex-col items-start gap-0.5"
          >
            <span>
              {c.nombre || nombreDeTipo(c.tipo)} · {c.propuesta.pct} %{c.propuesta.precio ? ` · ${pesos(c.propuesta.precio)}` : ""}
            </span>
            <span className="text-xs text-muted-foreground">
              {nombreDeTipo(c.tipo)}
              {c.propuesta.ajustado ? ` · ${c.propuesta.ajustado}` : ""}
              {c.ganancia != null ? ` · deja ${pesos(c.ganancia)}` : ""}
              {c.hasta ? ` · hasta el ${fecha(c.hasta)}` : ""}
            </span>
          </DropdownMenuItem>
        ))}
        {f.activa && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600"
              onClick={() => onPedir([{ mla: f.mla, accion: "sacar", promocionId: f.activa!.id, promocionTipo: f.activa!.tipo, precio: null }], `Sacar ${f.producto} de ${f.activa!.nombre || nombreDeTipo(f.activa!.tipo)}`)}
            >
              Sacar de {f.activa.nombre || nombreDeTipo(f.activa.tipo)}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ───────────────────────── Pestañas ───────────────────────── */

function TablaFilas({
  filas,
  general,
  onPedir,
  conAvisos,
  elegidas,
  onElegir,
}: {
  filas: FilaPromo[];
  general: number;
  onPedir: (p: PedidoDePromo[], t: string) => void;
  conAvisos?: boolean;
  /** Con selección: las publicaciones tildadas para un cambio en cantidad. */
  elegidas?: Set<string>;
  onElegir?: (mlas: string[], si: boolean) => void;
}) {
  const sel = !!elegidas && !!onElegir;
  const columnas = sel
    ? "md:grid-cols-[20px_minmax(0,2fr)_minmax(0,2fr)_90px_minmax(0,1.2fr)_32px]"
    : "md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_90px_minmax(0,1.2fr)_32px]";
  return (
    <div className="rounded-lg border divide-y text-sm">
      <div className={`hidden md:grid ${columnas} gap-3 px-3 py-2 text-xs text-muted-foreground items-center`}>
        {sel && (
          <input
            type="checkbox"
            aria-label="Elegir todas"
            checked={filas.length > 0 && filas.every((f) => elegidas!.has(f.mla))}
            onChange={(e) => onElegir!(filas.map((f) => f.mla), e.target.checked)}
          />
        )}
        <span>Producto</span>
        <span>Hoy</span>
        <span>Supone</span>
        <span>{conAvisos ? "Aviso" : "Deja hoy"}</span>
        <span />
      </div>
      {filas.map((f) => (
        <div
          key={f.mla}
          className={`grid ${sel ? "grid-cols-[20px_minmax(0,1fr)_32px]" : "grid-cols-[minmax(0,1fr)_32px]"} ${columnas} gap-x-3 gap-y-1 px-3 py-2 items-center ${sel && elegidas!.has(f.mla) ? "bg-primary/5" : ""}`}
        >
          {sel && <input type="checkbox" aria-label={`Elegir ${f.producto}`} checked={elegidas!.has(f.mla)} onChange={(e) => onElegir!([f.mla], e.target.checked)} />}
          <Producto f={f} />
          <div className="md:contents">
            <span className="col-span-2 md:col-span-1 text-xs md:text-sm">
              <Hoy f={f} />
            </span>
            <span className="text-xs md:text-sm">{f.esperada} %</span>
            <span className="text-xs">
              {conAvisos ? (
                <span className="flex flex-wrap gap-1">
                  {f.avisos.map((a) => (
                    <Badge key={a.tipo} variant="outline" className={AVISOS[a.tipo].clase} title={a.texto}>
                      {AVISOS[a.tipo].texto}
                    </Badge>
                  ))}
                </span>
              ) : (
                <Deja ganancia={f.ganancia} margen={f.margen} />
              )}
            </span>
          </div>
          <div className={`row-start-1 ${sel ? "col-start-3" : "col-start-2"} md:row-auto md:col-auto`}>
            <Acciones f={f} general={general} onPedir={onPedir} />
          </div>
        </div>
      ))}
    </div>
  );
}

type Masiva = "cambiar" | "sumar" | "sacar";

/**
 * Lo mismo para varias publicaciones elegidas en Avisos o Todas (Agustín, 2026-10-30: "selector
 * masivo"). Arma un pedido por publicación a la que le corresponde, y dice cuántas no y por qué.
 * Todo pasa después por la vista previa.
 */
function BarraMasiva({ d, elegidas, onLimpiar, onPedir }: { d: ResumenPromos; elegidas: Set<string>; onLimpiar: () => void; onPedir: (p: PedidoDePromo[], t: string, pct?: number) => void }) {
  const [accion, setAccion] = useState<Masiva>("cambiar");
  const [pct, setPct] = useState(String(d.promoGeneral));
  const campanas = d.campanas.filter((c) => c.aptas > 0 && ["SELLER_CAMPAIGN", "PRICE_DISCOUNT", "DEAL", "SELLER_COUPON_CAMPAIGN"].includes(c.tipo));
  const [campanaId, setCampanaId] = useState(() => campanas.find((c) => c.tipo === "SELLER_CAMPAIGN")?.id ?? campanas[0]?.id ?? "");
  const campana = campanas.find((c) => c.id === campanaId) ?? null;
  const n = Number(pct.replace(",", "."));
  const filas = d.filas.filter((f) => elegidas.has(f.mla));

  const pedidos: PedidoDePromo[] = [];
  const fuera: string[] = [];
  for (const f of filas) {
    if (accion === "cambiar") {
      if (f.activa && SE_CAMBIA.includes(f.activa.tipo) && Number.isFinite(n)) {
        pedidos.push({ mla: f.mla, accion: "cambiar", promocionId: f.activa.id, promocionTipo: f.activa.tipo, precio: Math.round(f.publicado * (1 - n / 100)) });
      } else fuera.push(f.producto);
    } else if (accion === "sacar") {
      if (f.activa) pedidos.push({ mla: f.mla, accion: "sacar", promocionId: f.activa.id, promocionTipo: f.activa.tipo, precio: null });
      else fuera.push(f.producto);
    } else {
      const c = campana && f.candidatas.find((x) => (campana.tipo === "PRICE_DISCOUNT" ? x.tipo === "PRICE_DISCOUNT" : x.id === campana.id));
      if (c && Number.isFinite(n)) pedidos.push({ mla: f.mla, accion: "sumar", promocionId: c.id, promocionTipo: c.tipo, precio: precioParaPct(c, f.publicado, n).precio });
      else fuera.push(f.producto);
    }
  }
  const motivo =
    accion === "cambiar" ? "no están en una campaña propia" : accion === "sacar" ? "no tienen promo" : "no son aptas para esa campaña";
  const titulo =
    accion === "cambiar"
      ? `Pasar ${pedidos.length} a ${pct} % en su campaña`
      : accion === "sacar"
        ? `Sacar ${pedidos.length} de su promo`
        : `Sumar ${pedidos.length} a ${campana?.nombre || nombreDeTipo(campana?.tipo ?? "")} al ${pct} %`;

  return (
    <Card className="border-primary/40 sticky top-2 z-10">
      <CardContent className="py-3 px-4 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {elegidas.size} {elegidas.size === 1 ? "elegida" : "elegidas"}
          </span>
          <select value={accion} onChange={(e) => setAccion(e.target.value as Masiva)} className="h-8 rounded-md border bg-transparent px-2">
            <option value="cambiar">Pasar a otro % en su campaña</option>
            <option value="sumar">Sumar a una campaña</option>
            <option value="sacar">Sacar de la promo</option>
          </select>
          {accion === "sumar" && (
            <select value={campanaId} onChange={(e) => setCampanaId(e.target.value)} className="h-8 rounded-md border bg-transparent px-2 max-w-[240px]">
              {campanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre || nombreDeTipo(c.tipo)} ({nombreDeTipo(c.tipo)})
                </option>
              ))}
            </select>
          )}
          {accion !== "sacar" && (
            <label className="flex items-center gap-1">
              <Input value={pct} onChange={(e) => setPct(e.target.value)} className="w-16 h-8" inputMode="decimal" />%
            </label>
          )}
          <Button size="sm" className="ml-auto" disabled={!pedidos.length} onClick={() => onPedir(pedidos, titulo, accion === "sacar" ? undefined : n)}>
            Ver {pedidos.length} y mandar
          </Button>
          <Button size="sm" variant="ghost" onClick={onLimpiar}>
            Limpiar
          </Button>
        </div>
        {fuera.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {fuera.length} no {fuera.length === 1 ? "entra" : "entran"}: {motivo} ({fuera.slice(0, 4).join(", ")}
            {fuera.length > 4 ? "…" : ""}).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Una campaña: las publicaciones aptas, con un % para todas y selección en cantidad (REQ-4, REQ-5). */
function PorCampana({ d, q, onPedir }: { d: ResumenPromos; q: string; onPedir: (p: PedidoDePromo[], t: string, pct?: number) => void }) {
  const visibles = d.campanas.filter((c) => c.aptas > 0 || c.adentro > 0);
  const [id, setId] = useState<string>(() => visibles.find((c) => c.tipo === "SELLER_CAMPAIGN")?.id ?? visibles[0]?.id ?? "");
  const campana = visibles.find((c) => c.id === id) ?? null;
  const [pct, setPct] = useState<string>(String(d.promoGeneral));
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());

  useEffect(() => setElegidas(new Set()), [id]);

  const mismo = (c: { id: string | null; tipo: string }) => (campana?.tipo === "PRICE_DISCOUNT" ? c.tipo === "PRICE_DISCOUNT" : c.id === campana?.id);
  const aptas = useMemo(
    () =>
      d.filas
        .map((f) => ({ f, c: f.candidatas.find(mismo) as CandidataCalculada | undefined }))
        .filter((x): x is { f: FilaPromo; c: CandidataCalculada } => !!x.c),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.filas, campana]
  );
  const adentro = d.filas.filter((f) => coincide(f, q) && ((f.activa && mismo(f.activa)) || f.pendientes.some(mismo) || f.cupones.some(mismo)));
  const pctNum = Number(pct.replace(",", "."));
  const conPct = aptas.map((x) => ({ ...x, p: precioParaPct(x.c, x.f.publicado, Number.isFinite(pctNum) ? pctNum : d.promoGeneral) }));
  // Se muestran las que coinciden con el buscador; lo tildado antes de buscar sigue tildado.
  const visiblesPct = conPct.filter((x) => coincide(x.f, q));

  if (!campana) return <EmptyState icon={Percent} title="No hay campañas" description="Leé las promos de ML para ver las campañas." />;

  function prender() {
    const pedidos: PedidoDePromo[] = conPct
      .filter((x) => elegidas.has(x.f.mla))
      .map((x) => ({ mla: x.f.mla, accion: "sumar", promocionId: x.c.id, promocionTipo: x.c.tipo, precio: x.p.precio }));
    onPedir(pedidos, `Sumar ${pedidos.length} a ${campana!.nombre || nombreDeTipo(campana!.tipo)}`, Number.isFinite(pctNum) ? pctNum : undefined);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {visibles.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setId(c.id)}
            className={`rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${c.id === id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
          >
            <span className="font-medium">{c.nombre || nombreDeTipo(c.tipo)}</span>
            <span className="block text-xs text-muted-foreground">
              {nombreDeTipo(c.tipo)}
              {c.pctFijo ? ` ${c.pctFijo} %` : ""} · {c.adentro} adentro · {c.aptas} aptas
              {c.estado === "pending" ? ` · arranca el ${fecha(c.desde)}` : c.hasta ? ` · hasta el ${fecha(c.hasta)}` : ""}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3 text-sm">
          {conPrecio(campana.tipo) && campana.tipo !== "SMART" && campana.tipo !== "PRICE_MATCHING" ? (
            <label className="flex items-center gap-2">
              Descuento
              <Input value={pct} onChange={(e) => setPct(e.target.value)} className="w-20 h-8" inputMode="decimal" />%
            </label>
          ) : (
            <span className="text-muted-foreground">{campana.pctFijo ? `Cupón de ${campana.pctFijo} %: se aplica al pagar, no cambia el precio publicado.` : "ML propone el precio de cada publicación."}</span>
          )}
          <span className="text-muted-foreground text-xs">Si ML no deja ese % en alguna, se usa el más cercano que sí y la fila lo dice.</span>
          <Button size="sm" className="ml-auto" disabled={!elegidas.size} onClick={prender}>
            Prender {elegidas.size || ""} {elegidas.size === 1 ? "seleccionada" : "seleccionadas"}
          </Button>
        </CardContent>
      </Card>

      {visiblesPct.length ? (
        <div className="rounded-lg border divide-y text-sm">
          <label className="flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={visiblesPct.every((x) => elegidas.has(x.f.mla))}
              onChange={(e) =>
                setElegidas((prev) => {
                  const s = new Set(prev);
                  for (const x of visiblesPct) {
                    if (e.target.checked) s.add(x.f.mla);
                    else s.delete(x.f.mla);
                  }
                  return s;
                })
              }
            />
            Aptas para esta campaña ({visiblesPct.length}
            {visiblesPct.length !== conPct.length ? ` de ${conPct.length}` : ""}){elegidas.size > 0 && ` · ${elegidas.size} tildadas`}
          </label>
          {visiblesPct.map(({ f, c, p }) => (
            <label key={f.mla} className="grid grid-cols-[20px_minmax(0,1fr)] md:grid-cols-[20px_minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.2fr)] gap-x-3 gap-y-1 px-3 py-2 items-center cursor-pointer hover:bg-muted/40">
              <input
                type="checkbox"
                checked={elegidas.has(f.mla)}
                onChange={(e) =>
                  setElegidas((prev) => {
                    const s = new Set(prev);
                    if (e.target.checked) s.add(f.mla);
                    else s.delete(f.mla);
                    return s;
                  })
                }
              />
              <Producto f={f} />
              <span className="col-start-2 md:col-auto text-xs md:text-sm">
                <Hoy f={f} />
              </span>
              <span className="col-start-2 md:col-auto text-xs md:text-sm">
                <span className="font-medium">{p.pct} %</span>
                {p.precio ? ` · ${pesos(p.precio)}` : ""}
                {p.ajustado && <span className="block text-xs text-amber-700 dark:text-amber-400">{p.ajustado}</span>}
                {c.pide != null && !p.ajustado && <span className="block text-xs text-muted-foreground">ML deja {c.pide}–{c.deja} %</span>}
              </span>
              <span className="col-start-2 md:col-auto text-xs md:text-sm">
                {p.pct === c.propuesta.pct ? <Deja ganancia={c.ganancia} margen={c.margen} /> : <span className="text-muted-foreground">deja: ver con {c.propuesta.pct} %</span>}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{q.trim() ? "Ninguna apta coincide con la búsqueda." : "Ninguna publicación es apta para esta campaña."}</p>
      )}

      {adentro.length > 0 && (
        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Ya están en esta campaña ({adentro.length})</summary>
          <div className="mt-2">
            <TablaFilas filas={adentro} general={d.promoGeneral} onPedir={onPedir} />
          </div>
        </details>
      )}
    </div>
  );
}

function Historial({ cambios }: { cambios: CambioDePromoRegistrado[] | null }) {
  if (!cambios) return <Skeleton className="h-40 rounded-xl" />;
  if (!cambios.length) return <EmptyState icon={Percent} title="Sin cambios todavía" description="Lo que se prenda, cambie o saque desde acá queda registrado." />;
  const ESTADO: Record<string, string> = { aplicado: "Listo", sin_efecto: "No cambió", rechazado: "No se mandó", error: "Error de ML" };
  const ACCION: Record<string, string> = { sumar: "Sumó a", cambiar: "Cambió en", sacar: "Sacó de" };
  return (
    <div className="rounded-lg border divide-y text-sm">
      {cambios.map((c) => {
        const antes = c.antes as { paga?: number; pct?: number } | null;
        const despues = c.despues as { paga?: number; pct?: number; pagaVerificado?: number } | null;
        return (
          <div key={c.id} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium truncate">{c.producto ?? c.mla}</p>
              <p className="text-xs text-muted-foreground">
                {ACCION[c.accion] ?? c.accion} {nombreDeTipo(c.promocionTipo)}
                {c.promocionId ? ` ${c.promocionId}` : ""} · paga {antes?.paga != null ? pesos(antes.paga) : "—"} →{" "}
                {despues?.pagaVerificado != null ? pesos(despues.pagaVerificado) : despues?.paga != null ? pesos(despues.paga) : "—"}
              </p>
            </div>
            <div className="text-xs text-right text-muted-foreground">
              <p className={c.estado === "aplicado" ? "text-emerald-600 dark:text-emerald-400" : c.estado === "error" ? "text-red-600" : ""}>{ESTADO[c.estado] ?? c.estado}</p>
              <p>
                {new Date(c.creadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                {c.usuario ? ` · ${c.usuario}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Pantalla ───────────────────────── */

export default function PaginaPromos() {
  const [datos, setDatos] = useState<ResumenPromos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [leyendo, setLeyendo] = useState<{ hechas: number; faltan: number } | null>(null);
  const [pestana, setPestana] = useState<Pestana>("avisos");
  const [filtro, setFiltro] = useState<TipoDeAviso | "todos">("todos");
  const [cambio, setCambio] = useState<{ pedidos: PedidoDePromo[]; titulo: string; pct?: number } | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const elegir = (mlas: string[], si: boolean) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      for (const m of mlas) {
        if (si) s.add(m);
        else s.delete(m);
      }
      return s;
    });
  const [historial, setHistorial] = useState<CambioDePromoRegistrado[] | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await pedir<ResumenPromos>("/api/promos"));
    } catch (e) {
      toast.error(`No se pudieron leer las promos: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (pestana === "historial") {
      pedir<CambioDePromoRegistrado[]>("/api/promos/historial")
        .then(setHistorial)
        .catch((e) => toast.error(`No se pudo leer el historial: ${e instanceof Error ? e.message : e}`));
    }
  }, [pestana]);

  /** Lee todas las publicaciones de a tandas: el servidor tiene un límite de tiempo por pedido. */
  async function leerDeMl() {
    const desde = new Date().toISOString();
    setLeyendo({ hechas: 0, faltan: datos?.filas.length ?? 0 });
    try {
      let hechas = 0;
      for (;;) {
        const r = await pedir<{ leidas: number; errores: unknown[]; faltan: number }>("/api/promos/leer", json("POST", { desde }));
        hechas += r.leidas + r.errores.length;
        setLeyendo({ hechas, faltan: r.faltan });
        if (!r.faltan || !(r.leidas + r.errores.length)) break;
      }
      await cargar();
    } catch (e) {
      toast.error(`Se cortó la lectura: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLeyendo(null);
    }
  }

  function aplicado() {
    setHistorial(null);
    setElegidas(new Set());
    cargar();
  }

  const d = datos;
  const conAviso = useMemo(() => d?.filas.filter((f) => f.avisos.length) ?? [], [d]);
  const cuenta = (t: TipoDeAviso) => conAviso.filter((f) => f.avisos.some((a) => a.tipo === t)).length;
  const avisosVisibles = (filtro === "todos" ? conAviso : conAviso.filter((f) => f.avisos.some((a) => a.tipo === filtro))).filter((f) => coincide(f, q));
  const todasVisibles = d?.filas.filter((f) => coincide(f, q)) ?? [];
  const pedirCambio = (pedidos: PedidoDePromo[], titulo: string, pct?: number) => setCambio({ pedidos, titulo, pct });

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Percent className="h-6 w-6 text-primary" /> Promos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Las promos de Mercado Libre de cada publicación, a cuáles se puede sumar y cuánto deja. Nada se prende solo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={leerDeMl} disabled={!!leyendo} title={d?.leidoEn ? `Última lectura completa ${haceCuanto(d.leidoEn)}` : undefined}>
            {leyendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {leyendo ? `Leyendo ${leyendo.hechas}…` : "Leer promos de ML"}
          </Button>
        </div>
      </div>

      {!d && cargando && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}

      {d && (
        <div className={`space-y-5 transition-opacity ${cargando ? "opacity-60" : ""}`}>
          {d.sinLeer > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="py-3 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                {d.sinLeer} {d.sinLeer === 1 ? "publicación no tiene" : "publicaciones no tienen"} las promos leídas. Tocá &quot;Leer promos de ML&quot;.
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Publicaciones activas" valor={String(d.filas.length)} detalle={`Leídas ${haceCuanto(d.leidoEn)}`} />
            <Tarjeta titulo="En una promo" valor={String(d.filas.filter((f) => f.activa).length)} detalle={`El precio supone ${d.promoGeneral} %`} />
            <Tarjeta titulo="Sin campaña" valor={String(cuenta("sin-promo"))} tono={cuenta("sin-promo") ? "mal" : undefined} detalle="El cliente paga el precio inflado entero" />
            <Tarjeta titulo="Con otro %" valor={String(cuenta("distinta"))} detalle={`${cuenta("vence")} vencen en menos de 3 días`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border overflow-hidden text-sm w-fit">
            {(
              [
                ["avisos", `Avisos (${conAviso.length})`],
                ["campana", "Por campaña"],
                ["todas", `Todas (${d.filas.length})`],
                ["historial", "Historial"],
              ] as const
            ).map(([v, texto]) => (
              <button key={v} type="button" onClick={() => setPestana(v)} className={`px-3 py-1.5 transition-colors ${pestana === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {texto}
              </button>
            ))}
          </div>
            {pestana !== "historial" && (
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o publicación" className="pl-7 h-8" />
              </div>
            )}
          </div>

          {elegidas.size > 0 && (pestana === "avisos" || pestana === "todas") && (
            <BarraMasiva d={d} elegidas={elegidas} onLimpiar={() => setElegidas(new Set())} onPedir={pedirCambio} />
          )}

          {pestana === "avisos" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                {(["todos", "sin-promo", "distinta", "de-mas", "vence"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFiltro(t)}
                    className={`rounded-full border px-3 py-1 transition-colors ${filtro === t ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                  >
                    {t === "todos" ? `Todos (${conAviso.length})` : `${AVISOS[t].texto} (${cuenta(t)})`}
                  </button>
                ))}
              </div>
              {avisosVisibles.length ? (
                <TablaFilas filas={avisosVisibles} general={d.promoGeneral} onPedir={pedirCambio} conAvisos elegidas={elegidas} onElegir={elegir} />
              ) : (
                <EmptyState icon={Percent} title="Nada para avisar" description="Todas las publicaciones tienen la promo que supone su precio." />
              )}
            </div>
          )}

          {pestana === "campana" && <PorCampana d={d} q={q} onPedir={pedirCambio} />}

          {pestana === "todas" &&
            (todasVisibles.length ? (
              <TablaFilas filas={todasVisibles} general={d.promoGeneral} onPedir={pedirCambio} elegidas={elegidas} onElegir={elegir} />
            ) : (
              <p className="text-sm text-muted-foreground">Ninguna publicación coincide con la búsqueda.</p>
            ))}

          {pestana === "historial" && <Historial cambios={historial} />}

          <details className="rounded-lg border bg-muted/20 px-4 py-3 text-sm group">
            <summary className="cursor-pointer font-medium list-none flex items-center gap-2">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /> Cómo se calcula
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground max-w-3xl">
              <p>
                <span className="text-foreground font-medium">Supone</span>: el precio publicado viene inflado para una promo ({d.promoGeneral} % en general,
                la de la pieza si tiene una propia). Si el cliente pagaría menos de $30.000 y el publicado los pasa, se publica sin promo y supone 0 %.
              </p>
              <p>
                <span className="text-foreground font-medium">Sin campaña</span>: el precio supone una promo y no hay ninguna activa, así que el cliente paga
                el precio inflado entero. <span className="text-foreground font-medium">% distinto</span>: tiene otra promo y deja otra plata.
              </p>
              <p>
                <span className="text-foreground font-medium">Deja</span>: lo que queda vendiendo a ese precio, con la comisión de la categoría, el cargo fijo,
                el envío y el costo del producto en el ERP.
              </p>
              <p>Las campañas de ML a veces piden más del {d.promoGeneral} %: se puede igual, pero la vista previa lo avisa. Relámpago y oferta del día se prenden en ML.</p>
            </div>
          </details>
        </div>
      )}

      <Dialog open={!!cambio} onOpenChange={(o) => !o && setCambio(null)}>
        <DialogContent className="sm:max-w-xl">
          {cambio && (
            <>
              <DialogHeader>
                <DialogTitle>{cambio.titulo}</DialogTitle>
                <DialogDescription>Revisá cada una antes de mandarlas a Mercado Libre.</DialogDescription>
              </DialogHeader>
              <ConfirmarPromos pedidos={cambio.pedidos} pctPedido={cambio.pct} onCerrar={() => setCambio(null)} onAplicado={aplicado} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
