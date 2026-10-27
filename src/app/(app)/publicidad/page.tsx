"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  History,
  Loader2,
  Megaphone,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { pedir, pesos } from "@/components/producto/seccion";
import { ConfirmarCambio } from "@/components/publicidad/confirmar-cambio";
import { GraficoDiario } from "@/components/publicidad/grafico-diario";
import {
  decimal,
  ESTRATEGIAS,
  esEstrategia,
  PERIODOS,
  ROAS_OBJETIVO_MAX,
  ROAS_OBJETIVO_MIN,
  textoEstado,
  type Alerta,
  type Estrategia,
  type Periodo,
} from "@/lib/publicidad-reglas";
import type { CambioRegistrado, FilaAnuncio, FilaCampana, PedidoDeCambio, ResumenPublicidad } from "@/lib/publicidad-ml";

/**
 * Publicidad (docs/sdd/005): qué deja cada campaña de Product Ads con el costo real de cada
 * producto, y los cambios con vista previa. Lo mismo que puede hacer Claude por el MCP.
 */

type Pestana = "campanas" | "sin-campana" | "historial";
type Disponible = Extract<ResumenPublicidad, { disponible: true }>;

const roasTexto = (n: number | null) => (n == null ? "—" : `${decimal(n)}×`);

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

/* ───────────────────────── Piezas chicas ───────────────────────── */

function Tarjeta({ titulo, valor, detalle, tono, icono }: { titulo: string; valor: string; detalle?: React.ReactNode; tono?: "bien" | "mal"; icono?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4 space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {icono}
          {titulo}
        </p>
        <p
          className={`text-2xl font-semibold tabular-nums tracking-tight ${
            tono === "bien" ? "text-emerald-600 dark:text-emerald-400" : tono === "mal" ? "text-red-600 dark:text-red-400" : ""
          }`}
        >
          {valor}
        </p>
        {detalle && <p className="text-xs text-muted-foreground leading-snug">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

function Alertas({ alertas }: { alertas: Alerta[] }) {
  if (!alertas.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {alertas.map((a) => (
        <span
          key={a.tipo}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            a.grave ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
          }`}
        >
          {a.grave ? <AlertTriangle className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
          {a.texto}
        </span>
      ))}
    </div>
  );
}

/** El ROAS real contra el mínimo: verde si alcanza, rojo si no, gris si no hay mínimo. */
function Roas({ roas, minimo, chico }: { roas: number | null; minimo: number | null; chico?: boolean }) {
  const tono =
    roas == null || minimo == null ? "" : roas >= minimo ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="tabular-nums">
      <p className={`${chico ? "text-sm" : "text-base"} font-semibold ${tono}`}>{roasTexto(roas)}</p>
      {minimo != null && <p className="text-[11px] text-muted-foreground">mín. {roasTexto(minimo)}</p>}
    </div>
  );
}

function Ganancia({ valor, chico }: { valor: number | null; chico?: boolean }) {
  if (valor == null) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <p className={`${chico ? "text-sm" : "text-base"} font-semibold tabular-nums ${valor >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {valor >= 0 ? "+" : "−"}
      {pesos(Math.abs(valor))}
    </p>
  );
}

function Metrica({ titulo, children, className = "text-right" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}

function Punto({ estado }: { estado: string }) {
  const s = estado.toLowerCase();
  return (
    <span
      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${s === "active" ? "bg-emerald-500" : s === "paused" ? "bg-muted-foreground/40" : "bg-amber-500"}`}
      title={textoEstado(estado)}
    />
  );
}

/* ───────────────────────── Anuncios ───────────────────────── */

function FilaDeAnuncio({ a, campanas, onCambiar }: { a: FilaAnuncio; campanas: FilaCampana[]; onCambiar: (p: PedidoDeCambio, titulo: string) => void }) {
  const activo = a.estado === "ACTIVE";
  const destinos = campanas.filter((c) => c.id !== a.campanaId && !c.esShay);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_repeat(4,minmax(5.5rem,auto))_auto] gap-x-4 gap-y-1 items-center px-4 py-3">
      {a.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.foto} alt="" className="h-10 w-10 rounded-md object-cover bg-muted" loading="lazy" />
      ) : (
        <div className="h-10 w-10 rounded-md bg-muted" />
      )}
      <div className="min-w-0">
        <p className="text-sm truncate" title={a.titulo}>
          {a.titulo}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {textoEstado(a.estado)}
          {a.costo
            ? ` · deja ${pesos(a.costo.ganancia)} por venta antes de publicidad (costo ${a.costo.fuente === "bodega" ? "de Bodega" : "de las ventas"})`
            : a.publicaciones.length
              ? " · sin costo en el ERP"
              : " · publicación que el ERP no conoce"}
          {a.publicaciones[0]?.enlace && (
            <a href={a.publicaciones[0].enlace} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 ml-1.5 hover:text-foreground">
              ver <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </p>
        {a.alertas.length > 0 && (
          <div className="mt-1">
            <Alertas alertas={a.alertas} />
          </div>
        )}
      </div>
      <Metrica titulo="Gasto" className="hidden sm:block text-right">
        <p className="text-sm tabular-nums">{pesos(a.gasto)}</p>
      </Metrica>
      <Metrica titulo="Ventas" className="hidden sm:block text-right">
        <p className="text-sm tabular-nums">{pesos(a.ventas)}</p>
        {a.unidades > 0 && <p className="text-[11px] text-muted-foreground">{a.unidades} u.</p>}
      </Metrica>
      <Metrica titulo="ROAS" className="hidden sm:block text-right">
        <Roas roas={a.roas} minimo={a.costo?.roasMinimo ?? null} chico />
      </Metrica>
      <Metrica titulo="Deja" className="hidden sm:block text-right">
        <Ganancia valor={a.gananciaEstimada} chico />
      </Metrica>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Acciones del anuncio" />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem
            onClick={() => onCambiar({ tipo: "anuncio", id: a.id, cambios: { status: activo ? "paused" : "active" } }, `${activo ? "Pausar" : "Activar"} anuncio`)}
          >
            {activo ? "Pausar este anuncio" : "Activar este anuncio"}
          </DropdownMenuItem>
          {destinos.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Mover a…</DropdownMenuLabel>
                {destinos.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => onCambiar({ tipo: "anuncio", id: a.id, cambios: { campaign_id: c.id } }, "Mover anuncio")}>
                    {c.nombre}
                    {c.estado !== "active" && <span className="ml-auto text-xs text-muted-foreground">pausada</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ───────────────────────── Campañas ───────────────────────── */

function TarjetaCampana({
  c,
  campanas,
  abierta,
  onAlternar,
  onEditar,
  onCambiar,
}: {
  c: FilaCampana;
  campanas: FilaCampana[];
  abierta: boolean;
  onAlternar: () => void;
  onEditar: () => void;
  onCambiar: (p: PedidoDeCambio, titulo: string) => void;
}) {
  const estrategia = esEstrategia(c.estrategia) ? ESTRATEGIAS[c.estrategia].texto : c.estrategia;
  return (
    <Card className={`overflow-hidden transition-shadow ${abierta ? "shadow-md" : "hover:shadow-sm"}`}>
      <div className="p-4 cursor-pointer" onClick={onAlternar}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Punto estado={c.estado} />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium leading-tight">{c.nombre}</h3>
                {c.esShay && <Badge variant="secondary">Shay</Badge>}
                {c.estado !== "active" && <Badge variant="outline">{textoEstado(c.estado)}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {pesos(c.presupuesto)} por día · ROAS objetivo {roasTexto(c.roasObjetivo)} · {estrategia}
                {c.ultimoCambio && ` · cambiada ${haceCuanto(c.ultimoCambio)}`}
              </p>
              <Alertas alertas={c.alertas} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(4,6.5rem)] gap-x-6 gap-y-3 sm:gap-x-4 shrink-0 pl-5 lg:pl-0">
            <Metrica titulo="Gasto" className="text-left sm:text-right">
              <p className="text-base font-semibold tabular-nums">{pesos(c.gasto)}</p>
            </Metrica>
            <Metrica titulo="Ventas" className="text-left sm:text-right">
              <p className="text-base font-semibold tabular-nums">{pesos(c.ventas)}</p>
              {c.unidades > 0 && <p className="text-[11px] text-muted-foreground">{c.unidades} u.</p>}
            </Metrica>
            <Metrica titulo="ROAS" className="text-left sm:text-right">
              <Roas roas={c.roas} minimo={c.roasMinimo} />
            </Metrica>
            <Metrica titulo="Deja" className="text-left sm:text-right">
              <Ganancia valor={c.gananciaEstimada} />
              {c.cobertura != null && c.cobertura < 0.95 && c.gananciaEstimada != null && (
                <p className="text-[11px] text-muted-foreground">sobre el {Math.round(c.cobertura * 100)} %</p>
              )}
              {!c.esShay && c.gasto > 0 && c.anuncios.length === 0 && <p className="text-[11px] text-muted-foreground">anuncios en otra</p>}
            </Metrica>
          </div>
          <div className="flex items-center gap-1 self-end lg:self-center" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={onEditar}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
            </Button>
            <Button variant="ghost" size="icon" onClick={onAlternar} aria-expanded={abierta} aria-label={abierta ? "Cerrar anuncios" : "Ver anuncios"}>
              <ChevronDown className={`h-4 w-4 transition-transform ${abierta ? "rotate-180" : ""}`} />
            </Button>
          </div>
        </div>
      </div>
      {abierta && (
        <div className="border-t bg-muted/20">
          {c.anuncios.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No tiene anuncios ahora. Lo que gastó en el período fue con anuncios que después pasaron a otra campaña.
            </p>
          ) : (
            <div className="divide-y">
              {c.anuncios.map((a) => (
                <FilaDeAnuncio key={a.id} a={a} campanas={campanas} onCambiar={onCambiar} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ───────────────────────── Editar una campaña ───────────────────────── */

function EditarCampana({ c, onCerrar, onAplicado }: { c: FilaCampana; onCerrar: () => void; onAplicado: () => void }) {
  const [presupuesto, setPresupuesto] = useState(String(Math.round(c.presupuesto)));
  const [roas, setRoas] = useState(c.roasObjetivo != null ? String(c.roasObjetivo).replace(".", ",") : "");
  const [estrategia, setEstrategia] = useState<string>(c.estrategia);
  const [estado, setEstado] = useState<string>(c.estado);
  const [pedido, setPedido] = useState<PedidoDeCambio | null>(null);

  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));
  const roasNum = num(roas);

  function revisar() {
    const cambios: Record<string, string | number> = {};
    if (num(presupuesto) !== Math.round(c.presupuesto)) cambios.budget = num(presupuesto);
    if (roas && roasNum !== c.roasObjetivo) cambios.roas_target = roasNum;
    if (estrategia !== c.estrategia) cambios.strategy = estrategia;
    if (estado !== c.estado) cambios.status = estado;
    if (!Object.keys(cambios).length) return toast.info("No cambiaste nada");
    setPedido({ tipo: "campana", id: c.id, cambios });
  }

  if (pedido) return <ConfirmarCambio pedido={pedido} onVolver={() => setPedido(null)} onCerrar={onCerrar} onAplicado={onAplicado} />;

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="presupuesto">Presupuesto por día</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input id="presupuesto" inputMode="numeric" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} className="pl-6 tabular-nums" />
          </div>
          <p className="text-xs text-muted-foreground">Algunos días ML gasta más, usando lo que no gastó antes.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="roas">ROAS objetivo</Label>
          <Input id="roas" inputMode="decimal" value={roas} onChange={(e) => setRoas(e.target.value)} className="tabular-nums" />
          <p className="text-xs text-muted-foreground">
            De {ROAS_OBJETIVO_MIN} a {ROAS_OBJETIVO_MAX}.
            {c.roasMinimo != null && (
              <>
                {" "}
                Para no perder plata, al menos <span className="font-medium text-foreground">{roasTexto(c.roasMinimo)}</span>.
              </>
            )}
          </p>
          {c.roasMinimo != null && roas && Number.isFinite(roasNum) && roasNum < c.roasMinimo && (
            <p className="text-xs text-red-600 dark:text-red-400">Con ese objetivo, ML puede vender a pérdida.</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Estrategia</Label>
        <div className="grid sm:grid-cols-3 gap-2">
          {(Object.keys(ESTRATEGIAS) as Estrategia[]).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEstrategia(e)}
              className={`rounded-lg border p-3 text-left transition-colors ${estrategia === e ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}
            >
              <p className="text-sm font-medium">{ESTRATEGIAS[e].texto}</p>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">{ESTRATEGIAS[e].ayuda}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">{estado === "active" ? "Activa" : "Pausada"}</p>
          <p className="text-xs text-muted-foreground">{estado === "active" ? "Los anuncios se muestran." : "No se muestra ni gasta nada."}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEstado(estado === "active" ? "paused" : "active")}>
          {estado === "active" ? "Pausar" : "Activar"}
        </Button>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button onClick={revisar}>Revisar el cambio</Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Sin campaña e historial ───────────────────────── */

function SinCampana({ filas, campanas, onCambiar }: { filas: FilaAnuncio[]; campanas: FilaCampana[]; onCambiar: (p: PedidoDeCambio, titulo: string) => void }) {
  const destinos = campanas.filter((c) => !c.esShay);
  if (!filas.length) return <EmptyState icon={Megaphone} title="Todo está en alguna campaña" description="No hay publicaciones sin campaña." />;
  return (
    <Card className="overflow-hidden">
      <p className="px-4 py-3 text-sm text-muted-foreground border-b">
        Publicaciones que se pueden anunciar y no están en ninguna campaña. Arriba, las que conoce el ERP; las de Shay y las que el ERP no conoce van al final.
      </p>
      <div className="divide-y">
        {filas.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
            {a.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.foto} alt="" className="h-9 w-9 rounded-md object-cover bg-muted" loading="lazy" />
            ) : (
              <div className="h-9 w-9 rounded-md bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{a.titulo}</p>
              <p className="text-xs text-muted-foreground">
                {a.costo ? `Deja ${pesos(a.costo.ganancia)} por venta · ROAS mínimo ${roasTexto(a.costo.roasMinimo)}` : a.publicaciones.length ? "Sin costo en el ERP" : "El ERP no la conoce"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>Agregar a…</DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {destinos.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => onCambiar({ tipo: "anuncio", id: a.id, cambios: { campaign_id: c.id, status: "active" } }, "Agregar a una campaña")}>
                    {c.nombre}
                    {c.estado !== "active" && <span className="ml-auto text-xs text-muted-foreground">pausada</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </Card>
  );
}

const CAMPOS: Record<string, string> = { budget: "Presupuesto", roas_target: "ROAS objetivo", strategy: "Estrategia", status: "Estado", campaign_id: "Campaña" };

function textoValor(campo: string, v: unknown): string {
  if (v == null) return "—";
  if (campo === "budget") return pesos(Number(v));
  if (campo === "roas_target") return roasTexto(Number(v));
  if (campo === "strategy" && esEstrategia(v)) return ESTRATEGIAS[v].texto;
  if (campo === "status") return textoEstado(String(v));
  return String(v);
}

function Historial({ cambios }: { cambios: CambioRegistrado[] | null }) {
  if (!cambios) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo el historial…
      </div>
    );
  }
  if (!cambios.length) return <EmptyState icon={History} title="Todavía no hay cambios" description="Lo que cambies acá o desde Claude va a quedar registrado en esta lista." />;
  return (
    <Card className="overflow-hidden">
      <div className="divide-y">
        {cambios.map((c) => (
          <div key={c.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {c.nombre ?? c.objetivoId} <span className="font-normal text-muted-foreground">· {c.tipo === "campana" ? "campaña" : "anuncio"}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {Object.keys(c.despues).map((k, i) => (
                  <span key={k}>
                    {i > 0 && " · "}
                    {CAMPOS[k] ?? k}: {textoValor(k, c.antes?.[k])} → <span className="text-foreground">{textoValor(k, c.despues[k])}</span>
                  </span>
                ))}
              </p>
              {c.estado === "error" && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">{String((c.respuesta as { error?: string } | null)?.error ?? "error")}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 text-xs">
              <Badge variant={c.origen === "claude" ? "secondary" : "outline"}>{c.origen === "claude" ? "Claude" : "Pantalla"}</Badge>
              <Badge variant={c.estado === "aplicado" ? "outline" : "destructive"}>{c.estado === "aplicado" ? "Aplicado" : "Error"}</Badge>
              <span className="text-muted-foreground tabular-nums">
                {new Date(c.creadoEn).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ───────────────────────── Pantalla ───────────────────────── */

export default function PaginaPublicidad() {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [datos, setDatos] = useState<ResumenPublicidad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("campanas");
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const [editando, setEditando] = useState<FilaCampana | null>(null);
  const [cambio, setCambio] = useState<{ pedido: PedidoDeCambio; titulo: string } | null>(null);
  const [historial, setHistorial] = useState<CambioRegistrado[] | null>(null);

  const cargar = useCallback(async (p: Periodo) => {
    setCargando(true);
    try {
      setDatos(await pedir<ResumenPublicidad>(`/api/publicidad?periodo=${p}`));
    } catch (e) {
      toast.error(`No se pudo leer la publicidad: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(periodo);
  }, [cargar, periodo]);

  const leerHistorial = useCallback(() => {
    pedir<CambioRegistrado[]>("/api/publicidad/historial")
      .then(setHistorial)
      .catch((e) => toast.error(`No se pudo leer el historial: ${e instanceof Error ? e.message : e}`));
  }, []);

  useEffect(() => {
    if (pestana === "historial") leerHistorial();
  }, [pestana, leerHistorial]);

  function aplicado() {
    setEditando(null);
    setCambio(null);
    setHistorial(null);
    cargar(periodo);
    if (pestana === "historial") leerHistorial();
  }

  const d = datos?.disponible ? (datos as Disponible) : null;
  const unidades = useMemo(() => (d ? d.campanas.filter((c) => !c.esShay).reduce((s, c) => s + c.unidades, 0) : 0), [d]);
  const conErp = d?.sinCampana.filter((a) => a.publicaciones.length).length ?? 0;
  const graves = d ? d.campanas.filter((c) => c.alertas.some((a) => a.grave)).length : 0;

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Publicidad
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Product Ads de Mercado Libre, con lo que deja cada campaña según el costo de cada producto.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border overflow-hidden text-sm">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1.5 transition-colors ${periodo === p.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {p.texto}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => cargar(periodo)} disabled={cargando} title={d ? `Leído ${haceCuanto(d.leidoEn)}` : undefined}>
            {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {datos && !datos.disponible && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" /> {datos.motivo}
          </CardContent>
        </Card>
      )}

      {!d && cargando && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-44 rounded-xl" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
          <p className="text-xs text-muted-foreground text-center">Leyendo campañas y anuncios de Mercado Libre…</p>
        </div>
      )}

      {d && (
        <div className={`space-y-5 transition-opacity ${cargando ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Gastado en publicidad" valor={pesos(d.totales.gasto)} detalle={`${d.campanas.filter((c) => !c.esShay && c.estado === "active").length} campañas de Sendero activas`} />
            <Tarjeta titulo="Ventas por publicidad" valor={pesos(d.totales.ventas)} detalle={`${unidades} unidades atribuidas a los anuncios`} />
            <Tarjeta
              titulo="ROAS"
              valor={roasTexto(d.totales.roas)}
              detalle={d.totales.roas != null ? `Cada $1 de publicidad trajo $${decimal(d.totales.roas, 2)} en ventas` : undefined}
            />
            <Tarjeta
              titulo="Te dejó, después de publicidad"
              icono={d.totales.gananciaEstimada != null && d.totales.gananciaEstimada < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
              valor={d.totales.gananciaEstimada == null ? "—" : `${d.totales.gananciaEstimada < 0 ? "−" : ""}${pesos(Math.abs(d.totales.gananciaEstimada))}`}
              tono={d.totales.gananciaEstimada == null ? undefined : d.totales.gananciaEstimada >= 0 ? "bien" : "mal"}
              detalle={
                d.totales.cobertura != null
                  ? `Estimado, con el costo de cada producto. Cubre el ${Math.round(d.totales.cobertura * 100)} % del gasto.`
                  : "Ningún anuncio tiene costo en el ERP."
              }
            />
          </div>

          {(d.shay.gasto > 0 || graves > 0) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {graves > 0 && (
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {graves} {graves === 1 ? "campaña pierde plata" : "campañas pierden plata"} o gasta sin vender
                </span>
              )}
              {d.shay.gasto > 0 && (
                <span>
                  Shay, aparte: gastó {pesos(d.shay.gasto)} y vendió {pesos(d.shay.ventas)}.
                </span>
              )}
            </div>
          )}

          {d.dias.length > 1 && (
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <p className="text-sm font-medium mb-2">Día por día</p>
                <GraficoDiario dias={d.dias} />
              </CardContent>
            </Card>
          )}

          <div className="flex rounded-md border overflow-hidden text-sm w-fit">
            {(
              [
                ["campanas", `Campañas (${d.campanas.length})`],
                ["sin-campana", `Sin campaña (${conErp})`],
                ["historial", "Historial"],
              ] as const
            ).map(([v, texto]) => (
              <button key={v} type="button" onClick={() => setPestana(v)} className={`px-3 py-1.5 transition-colors ${pestana === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {texto}
              </button>
            ))}
          </div>

          {pestana === "campanas" &&
            (d.campanas.length ? (
              <div className="space-y-3">
                {d.campanas.map((c) => (
                  <TarjetaCampana
                    key={c.id}
                    c={c}
                    campanas={d.campanas}
                    abierta={abiertas.has(c.id)}
                    onAlternar={() =>
                      setAbiertas((prev) => {
                        const s = new Set(prev);
                        if (s.has(c.id)) s.delete(c.id);
                        else s.add(c.id);
                        return s;
                      })
                    }
                    onEditar={() => setEditando(c)}
                    onCambiar={(pedido, titulo) => setCambio({ pedido, titulo })}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={Megaphone} title="No hay campañas" description="La cuenta de Mercado Libre no tiene campañas de Product Ads." />
            ))}

          {pestana === "sin-campana" && (
            <SinCampana filas={d.sinCampana.filter((a) => a.publicaciones.length)} campanas={d.campanas} onCambiar={(pedido, titulo) => setCambio({ pedido, titulo })} />
          )}

          {pestana === "historial" && <Historial cambios={historial} />}

          <details className="rounded-lg border bg-muted/20 px-4 py-3 text-sm group">
            <summary className="cursor-pointer font-medium list-none flex items-center gap-2">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /> Cómo se calcula
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground max-w-3xl">
              <p>
                <span className="text-foreground font-medium">Lo que deja una venta antes de publicidad</span>: el precio de la publicación menos el costo del
                producto (Bodega, o el de sus últimas ventas si Bodega no lo tiene), la comisión, las cuotas, IIBB, el cargo fijo y el envío si el precio pasa
                el umbral. Son los mismos gastos de la calculadora de Bodega, sin la línea de publicidad.
              </p>
              <p>
                <span className="text-foreground font-medium">ROAS mínimo</span>: el precio dividido por eso. Debajo de ese número, lo que se paga de
                publicidad por cada venta se come toda la ganancia.
                {d.roasQueAsumeElPrecio != null && ` Los precios de Bodega asumen un ROAS de ${roasTexto(d.roasQueAsumeElPrecio)}.`}
              </p>
              <p>
                <span className="text-foreground font-medium">Lo que te dejó</span>: las ventas atribuidas por el margen de cada anuncio, menos lo gastado. Las
                ventas indirectas (alguien entra por un anuncio y compra otra cosa) se cuentan con el margen del anuncio, así que es una estimación.
                Si un anuncio cambió de campaña en el período, cuenta entero en la campaña donde está ahora: la de antes queda con gasto y sin anuncios.
              </p>
              <p>Cada cambio de una campaña la vuelve a poner en aprendizaje unos días: conviene cambiar poco y esperar.</p>
            </div>
          </details>
        </div>
      )}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-xl">
          {editando && (
            <>
              <DialogHeader>
                <DialogTitle>{editando.nombre}</DialogTitle>
                <DialogDescription>
                  Gastó {pesos(editando.gasto)} y vendió {pesos(editando.ventas)} en el período (ROAS {roasTexto(editando.roas)}).
                </DialogDescription>
              </DialogHeader>
              <EditarCampana c={editando} onCerrar={() => setEditando(null)} onAplicado={aplicado} />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cambio} onOpenChange={(o) => !o && setCambio(null)}>
        <DialogContent className="sm:max-w-lg">
          {cambio && (
            <>
              <DialogHeader>
                <DialogTitle>{cambio.titulo}</DialogTitle>
                <DialogDescription>Revisá el cambio antes de mandarlo.</DialogDescription>
              </DialogHeader>
              <ConfirmarCambio pedido={cambio.pedido} onCerrar={() => setCambio(null)} onAplicado={aplicado} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
