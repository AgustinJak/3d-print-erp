"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { CalendarDays, ChevronRight, Loader2, Plus, Radar, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { Segmentado } from "@/components/segmentado";
import { json, pedir } from "@/components/producto/seccion";
import { haceCuanto } from "@/components/precios/por-producto";
import { BusquedasNuevas } from "@/components/tendencias/busquedas-nuevas";
import { Calendario } from "@/components/tendencias/calendario";
import { FichaTema } from "@/components/tendencias/ficha-tema";
import { BarraDePuntaje, EtiquetaSenal, TIPO_DE_EVENTO, fechaCorta } from "@/components/tendencias/senal";
import { ETIQUETA_DE_TIPO, TIPOS_DE_TEMA, diasHasta, type TipoDeTema } from "@/lib/temas";
import type { TemaEnLista, VistaDeTendencias } from "@/lib/tendencias-vista";

/**
 * Tendencias por tema (docs/sdd/016): qué conviene mirar ahora, juntando lo que se busca en
 * Mercado Libre, lo que viene (estrenos, temporadas, fechas comerciales) y lo que vendés. Cada fila
 * dice por qué está ahí (RN-1); el click abre la ficha del tema al costado.
 */

type Filtro = "mirar" | "todos";
type Tarjeta = "ml" | "fechas" | "oportunidad" | "bajan" | null;

const TIPOS_FILTRO: Array<["todos" | TipoDeTema, string]> = [["todos", "Todos los tipos"], ...TIPOS_DE_TEMA.map((t) => [t, ETIQUETA_DE_TIPO[t]] as ["todos" | TipoDeTema, string])];

export default function TendenciasPage() {
  const [v, setV] = useState<VistaDeTendencias | null>(null);
  const [seccion, setSeccion] = useState<"temas" | "calendario">("temas");
  const [actualizando, setActualizando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("mirar");
  const [tarjeta, setTarjeta] = useState<Tarjeta>(null);
  const [tipo, setTipo] = useState<"todos" | TipoDeTema>("todos");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [nuevoTema, setNuevoTema] = useState<{ nombre: string; palabra: string | null; tipo: TipoDeTema } | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setV(await pedir<VistaDeTendencias>("/api/tendencias/temas"));
    } catch (e) {
      toast.error(`No se pudo leer Tendencias: ${e instanceof Error ? e.message : e}`);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  async function actualizar() {
    setActualizando(true);
    try {
      await pedir("/api/tendencias/sync", { method: "POST" });
      await cargar();
      toast.success("Tendencias al día: búsquedas de ML y calendario");
    } catch (e) {
      toast.error(`No se pudo actualizar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setActualizando(false);
    }
  }

  async function crearTema() {
    if (!nuevoTema) return;
    setCreando(true);
    try {
      const r = await pedir<{ id: string }>("/api/tendencias/temas", json("POST", { nombre: nuevoTema.nombre, tipo: nuevoTema.tipo, palabra: nuevoTema.palabra }));
      toast.success(`Tema «${nuevoTema.nombre}» creado`);
      setNuevoTema(null);
      await cargar();
      setAbierto(r.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCreando(false);
    }
  }

  const temas = useMemo(() => v?.temas ?? [], [v]);
  const activos = useMemo(() => temas.filter((t) => t.activo), [temas]);
  const tiene = (t: TemaEnLista, clave: string) => t.lectura.senales.some((s) => s.clave === clave);
  const cerca = (t: TemaEnLista) => t.eventos.some((e) => {
    const d = diasHasta(e.fecha);
    return d >= 0 && d <= 45;
  });
  const totales = useMemo(
    () => ({
      ml: activos.filter((t) => tiene(t, "ml")).length,
      fechas: activos.filter(cerca).length,
      oportunidad: activos.filter((t) => t.lectura.oportunidad).length,
      bajan: activos.filter((t) => tiene(t, "baja")).length,
      mirar: activos.filter((t) => t.lectura.puntaje > 0).length,
    }),
    [activos]
  );
  const maximo = Math.max(1, ...activos.map((t) => t.lectura.puntaje));

  const visibles = useMemo(() => {
    const n = q.trim().toLowerCase();
    return temas.filter((t) => {
      if (filtro === "mirar" && (!t.activo || t.lectura.puntaje <= 0) && !tarjeta) return false;
      if (tarjeta && !t.activo) return false;
      if (tarjeta === "ml" && !tiene(t, "ml")) return false;
      if (tarjeta === "fechas" && !cerca(t)) return false;
      if (tarjeta === "oportunidad" && !t.lectura.oportunidad) return false;
      if (tarjeta === "bajan" && !tiene(t, "baja")) return false;
      if (tipo !== "todos" && t.tipo !== tipo) return false;
      if (n && !t.nombre.toLowerCase().includes(n) && !t.alias.some((a) => a.includes(n))) return false;
      return true;
    });
  }, [temas, filtro, tarjeta, tipo, q]);

  const tarjetas: Array<{ k: Exclude<Tarjeta, null>; titulo: string; n: number; detalle: string }> = [
    { k: "ml", titulo: "Suben en Mercado Libre", n: totales.ml, detalle: "temas con búsquedas en el top 50" },
    { k: "fechas", titulo: "Vienen pronto", n: totales.fechas, detalle: "con una fecha en los próximos 45 días" },
    { k: "oportunidad", titulo: "Sin producto", n: totales.oportunidad, detalle: "se buscan o vienen, y no tenés" },
    { k: "bajan", titulo: "Bajan", n: totales.bajan, detalle: "vendieron menos que el mes anterior" },
  ];

  const proximas = (v?.calendario ?? []).filter((e) => {
    const d = diasHasta(e.fecha);
    return d >= 0 && d <= 60;
  });
  const resumenSync = v?.sync?.resumen as { ml?: { categorias?: number; palabras?: number; error?: string }; calendario?: { guardados?: number; error?: string } } | undefined;

  return (
    <motion.div className="space-y-6 pb-16" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-[28px] leading-[1.15] font-medium">Tendencias</h1>
          <p className="text-sm text-muted-foreground">
            Lo que se busca en Mercado Libre, lo que viene y lo que vendés, por tema.
            {v?.fotoMl && ` Búsquedas de ML del ${new Date(`${v.fotoMl}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" })}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={actualizar} disabled={actualizando}>
            {actualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />}
            Actualizar
            <span className="text-xs font-normal text-muted-foreground">{actualizando ? "leyendo…" : haceCuanto(v?.sync?.hora ?? null)}</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNuevoTema({ nombre: "", palabra: null, tipo: "otro" })}>
            <Plus className="h-4 w-4" strokeWidth={1.5} /> Nuevo tema
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((t) => {
          const activa = tarjeta === t.k;
          return (
            <button
              key={t.k}
              type="button"
              onClick={() => {
                setTarjeta(activa ? null : t.k);
                setSeccion("temas");
              }}
              aria-pressed={activa}
              className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${activa ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="text-xs text-muted-foreground">{t.titulo}</div>
              <div className={`mt-2 font-mono text-[28px] leading-none font-medium tabular-nums ${t.n === 0 ? "text-muted-foreground/60" : ""}`}>{v ? t.n : "·"}</div>
              <div className="mt-1.5 truncate text-xs text-muted-foreground">{t.detalle}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <Segmentado
            etiqueta="Vista"
            valor={seccion}
            onChange={setSeccion}
            opciones={[
              ["temas", <>Temas</>],
              ["calendario", <>Calendario <span className="font-mono text-muted-foreground tabular-nums">{v ? v.calendario.filter((e) => diasHasta(e.fecha) >= 0).length : ""}</span></>],
            ]}
          />
          {seccion === "calendario" ? (
            v ? (
              <Calendario eventos={v.calendario} temas={activos.map((t) => ({ id: t.id, nombre: t.nombre }))} onAbrirTema={setAbierto} onCambio={cargar} />
            ) : (
              <Skeleton className="h-96 w-full rounded-xl" />
            )
          ) : (
            <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado
              chico
              etiqueta="Qué temas"
              valor={filtro}
              onChange={(x) => {
                setFiltro(x);
                setTarjeta(null);
              }}
              opciones={[
                ["mirar", <>Para mirar <span className="font-mono text-muted-foreground tabular-nums">{totales.mirar}</span></>],
                ["todos", <>Todos <span className="font-mono text-muted-foreground tabular-nums">{temas.length}</span></>],
              ]}
            />
            {tarjeta && (
              <button type="button" onClick={() => setTarjeta(null)} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs">
                {tarjetas.find((t) => t.k === tarjeta)?.titulo} <X className="h-3 w-3" />
              </button>
            )}
            <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="h-7 rounded-md border bg-transparent px-2 text-xs" aria-label="Tipo de tema">
              {TIPOS_FILTRO.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tema o alias" className="h-8 pl-8" />
            </div>
          </div>

          {!v ? (
            <div className="divide-y rounded-xl border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-11 w-11 rounded-lg" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="ml-auto h-4 w-48" />
                </div>
              ))}
            </div>
          ) : !visibles.length ? (
            <EmptyState
              icon={Radar}
              title={temas.length ? "Nada para mostrar" : "Todavía no hay temas"}
              description={temas.length ? "Ningún tema con ese filtro. Probá con Todos." : "Los temas salen de la serie de tus productos."}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="hidden items-center gap-4 border-b px-4 py-2 text-xs text-muted-foreground md:grid md:grid-cols-[44px_minmax(0,1fr)_96px_64px_16px]">
                <span />
                <span>
                  {visibles.length} {visibles.length === 1 ? "tema" : "temas"}
                </span>
                <span className="text-right">Vendidos 30 d</span>
                <span className="text-right">Señal</span>
                <span />
              </div>
              <ul className="divide-y">
                {visibles.map((t) => (
                  <FilaTema key={t.id} t={t} maximo={maximo} onAbrir={() => setAbierto(t.id)} />
                ))}
              </ul>
            </div>
          )}
            </>
          )}
        </div>

        <aside className="space-y-6">
          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div>
              <h2 className="text-sm font-medium">Búsquedas nuevas</h2>
              <p className="text-xs text-muted-foreground">Suben en ML y no son de ningún tema</p>
            </div>
            {v ? (
              <BusquedasNuevas
                nuevas={v.nuevas}
                temas={activos.map((t) => ({ id: t.id, nombre: t.nombre }))}
                onCrear={(palabra) => setNuevoTema({ nombre: palabra.charAt(0).toUpperCase() + palabra.slice(1), palabra, tipo: "otro" })}
                onCambio={cargar}
              />
            ) : (
              <Skeleton className="h-40 w-full rounded-lg" />
            )}
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-4">
            <div>
              <h2 className="text-sm font-medium">Próximas fechas</h2>
              <p className="text-xs text-muted-foreground">Los próximos 60 días</p>
            </div>
            {!v ? (
              <Skeleton className="h-40 w-full rounded-lg" />
            ) : !proximas.length ? (
              <p className="text-sm text-muted-foreground">Nada en los próximos 60 días.</p>
            ) : (
              <ul className="-mx-2">
                {proximas.map((e) => {
                  const d = diasHasta(e.fecha);
                  const contenido = (
                    <>
                      <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{fechaCorta(e.fecha)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{e.titulo}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {e.temaNombre ?? TIPO_DE_EVENTO[e.tipo] ?? e.tipo}
                          {e.temaNombre && ` · ${TIPO_DE_EVENTO[e.tipo] ?? e.tipo}`}
                          {!e.enArgentina && " · fecha mundial"}
                        </span>
                      </span>
                      <span className={`shrink-0 text-xs ${d <= 21 ? "text-foreground" : "text-muted-foreground"}`}>{d === 0 ? "hoy" : `${d} d`}</span>
                    </>
                  );
                  return (
                    <li key={(e.id ?? e.titulo) + e.fecha}>
                      {e.temaId ? (
                        <button type="button" onClick={() => setAbierto(e.temaId)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60">
                          {contenido}
                        </button>
                      ) : (
                        <div className="flex items-center gap-3 px-2 py-1.5 text-sm">{contenido}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {v?.sync && (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />
          Última actualización {haceCuanto(v.sync.hora)}
          {resumenSync?.ml && (resumenSync.ml.error ? ` · ML no contestó: ${resumenSync.ml.error}` : ` · ML: ${resumenSync.ml.palabras ?? 0} búsquedas en ${resumenSync.ml.categorias ?? 0} categorías`)}
          {resumenSync?.calendario && (resumenSync.calendario.error ? ` · el calendario falló: ${resumenSync.calendario.error}` : ` · ${resumenSync.calendario.guardados ?? 0} estrenos y temporadas`)}
          {" · se actualiza sola cada mañana"}
        </p>
      )}

      <FichaTema temaId={abierto} temas={activos.map((t) => ({ id: t.id, nombre: t.nombre }))} onCerrar={() => setAbierto(null)} onCambio={cargar} />

      <Dialog open={!!nuevoTema} onOpenChange={(o) => !o && setNuevoTema(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo tema</DialogTitle>
            <DialogDescription>
              {nuevoTema?.palabra
                ? `«${nuevoTema.palabra}» queda como alias: las búsquedas que la contengan suman a este tema.`
                : "Un tema junta productos por su serie, búsquedas de ML y fechas. Después le podés sumar alias."}
            </DialogDescription>
          </DialogHeader>
          {nuevoTema && (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Nombre</span>
                <Input autoFocus value={nuevoTema.nombre} onChange={(e) => setNuevoTema({ ...nuevoTema, nombre: e.target.value })} className="h-8" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Tipo</span>
                <select value={nuevoTema.tipo} onChange={(e) => setNuevoTema({ ...nuevoTema, tipo: e.target.value as TipoDeTema })} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
                  {TIPOS_DE_TEMA.map((x) => (
                    <option key={x} value={x}>
                      {ETIQUETA_DE_TIPO[x]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNuevoTema(null)}>
              Cancelar
            </Button>
            <Button disabled={creando || (nuevoTema?.nombre.trim().length ?? 0) < 2} onClick={crearTema}>
              {creando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function FilaTema({ t, maximo, onAbrir }: { t: TemaEnLista; maximo: number; onAbrir: () => void }) {
  const { ultimos30: u, anteriores30: a } = t.ventas;
  return (
    <li
      className={`group grid cursor-pointer grid-cols-[44px_minmax(0,1fr)_16px] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[44px_minmax(0,1fr)_96px_64px_16px] ${t.activo ? "" : "opacity-60"}`}
      onClick={onAbrir}
    >
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {t.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.foto} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-medium text-muted-foreground/60">{t.nombre.slice(0, 1).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{t.nombre}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {ETIQUETA_DE_TIPO[t.tipo] ?? t.tipo} · {t.productos} {t.productos === 1 ? "producto" : "productos"}
            {!t.activo && " · desactivado"}
          </span>
        </div>
        {t.lectura.senales.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {t.lectura.senales
              .filter((s) => s.clave !== "ventas")
              .map((s) => (
                <EtiquetaSenal key={s.clave + s.texto} s={s} />
              ))}
            {t.lectura.senales.some((s) => s.clave === "ventas") && <span className="self-center text-xs text-muted-foreground md:hidden">{t.lectura.senales.find((s) => s.clave === "ventas")?.texto}</span>}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Sin señales esta semana</div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 md:order-last" />
      <div className="hidden text-right md:block">
        <div className="font-mono text-sm tabular-nums">{u}</div>
        <div className={`text-xs ${u >= 5 && u >= 1.5 * a ? "text-foreground" : "text-muted-foreground"}`}>antes {a}</div>
      </div>
      <div className="hidden justify-end md:flex">
        <BarraDePuntaje puntaje={t.lectura.puntaje} maximo={maximo} />
      </div>
    </li>
  );
}
