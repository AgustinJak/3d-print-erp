"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Truck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Segmentado } from "@/components/segmentado";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { Candidato, Dia, Reparto, Semana } from "@/lib/reparto";

/**
 * Reparto (docs/sdd/018): el repartidor de Flex y de la mensajería de la web.
 * - Por día: los envíos de un día de despacho (hoy, mañana…) con zona y precio; se tildan y se le
 *   manda el link de ese día por WhatsApp, también el día antes.
 * - Semanas: lo entregado de lunes a domingo, el total, cuánto dejó, y marcar pagado.
 * - Tarifas: el precio por zona (la lista de SyB Logística).
 */

type Pestana = "hoy" | "semanas" | "tarifas";
const ZONA = "America/Argentina/Buenos_Aires";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
const fechaCorta = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });

const ESTADO: Record<string, { texto: string; clase: string }> = {
  ofrecido: { texto: "sin responder", clase: "text-muted-foreground" },
  tomado: { texto: "lo lleva", clase: "text-foreground" },
  rechazado: { texto: "no lo lleva", clase: "text-amber-600 dark:text-amber-400" },
  entregado: { texto: "entregado", clase: "text-primary" },
  no_entregado: { texto: "no se pudo", clase: "text-amber-600 dark:text-amber-400" },
};

export default function RepartoPage() {
  const [pestana, setPestana] = useState<Pestana>("hoy");
  return (
    <motion.div className="space-y-6 pb-28" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      <header className="space-y-1.5">
        <h1 className="text-[28px] leading-[1.15] font-medium">Reparto</h1>
        <p className="text-sm text-muted-foreground">Los Flex y la mensajería de la web que lleva el repartidor, y lo que hay que pagarle cada lunes.</p>
      </header>
      <Segmentado
        etiqueta="Sección"
        valor={pestana}
        onChange={setPestana}
        opciones={[
          ["hoy", <>Por día</>],
          ["semanas", <>Semanas</>],
          ["tarifas", <>Tarifas</>],
        ]}
      />
      {pestana === "hoy" ? <Hoy /> : pestana === "semanas" ? <Semanas /> : <Tarifas />}
    </motion.div>
  );
}

// ─── Hoy ───────────────────────────────────────────────────────────────

const ESTADO_PEDIDO: Record<string, string> = { CONFIRMADO: "confirmado", EN_PRODUCCION: "en producción", TERMINADO: "listo" };

function nombreDelDia(dia: string, hoy: string, largo = false): string {
  const manana = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10);
  if (dia === hoy) return "Hoy";
  if (dia === manana) return "Mañana";
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-AR", largo ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { weekday: "short", day: "numeric", timeZone: "UTC" });
}

// Por defecto, todos tildados (decisión de Agustín): lo ya ofrecido y lo nuevo, menos lo que rechazó.
const porDefecto = (candidatos: Candidato[]) => new Set(candidatos.filter((c) => c.enHoja?.estado !== "rechazado").map((c) => c.pedidoId));

function Hoy() {
  // La semana entera llega de una vez: cambiar de día no vuelve a leer Mercado Libre (2026-11-23).
  const [r, setR] = useState<Reparto | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [elegidosDe, setElegidosDe] = useState<Record<string, Set<string>>>({});
  const [zonaDe, setZonaDe] = useState<Record<string, string>>({});
  const [mandando, setMandando] = useState(false);
  const [linkDe, setLinkDe] = useState<Record<string, string>>({});
  const vistosRef = useRef<Record<string, Set<string>>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const nuevo = await pedir<Reparto>("/api/reparto/hoy");
      setR(nuevo);
      // Lo que ya se tildó a mano se respeta; los días nuevos arrancan con todo tildado. Lo que
      // apareció en un día ya visto (un pedido nuevo) entra tildado.
      const vistos = vistosRef.current;
      setElegidosDe((antes) => {
        const out: Record<string, Set<string>> = {};
        for (const x of nuevo.dias) {
          const previo = antes[x.dia];
          if (!previo) {
            out[x.dia] = porDefecto(x.candidatos);
            continue;
          }
          const s = new Set([...previo].filter((id) => x.candidatos.some((c) => c.pedidoId === id)));
          for (const id of porDefecto(x.candidatos)) if (!vistos[x.dia]?.has(id)) s.add(id);
          out[x.dia] = s;
        }
        return out;
      });
      vistosRef.current = Object.fromEntries(nuevo.dias.map((x) => [x.dia, new Set(x.candidatos.map((c) => c.pedidoId))]));
    } catch (e) {
      toast.error(`No se pudo leer el reparto: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const diaPuesto = dia ?? r?.hoy ?? null;
  const delDiaPuesto = r?.dias.find((x) => x.dia === diaPuesto) ?? r?.dias[0];
  const d: Dia | null = r && delDiaPuesto ? { ...r, dia: delDiaPuesto.dia, candidatos: delDiaPuesto.candidatos, hoja: delDiaPuesto.hoja } : null;
  const elegidos = (d && elegidosDe[d.dia]) || new Set<string>();
  const setElegidos = (f: Set<string> | ((s: Set<string>) => Set<string>)) => {
    if (!d) return;
    setElegidosDe((x) => ({ ...x, [d.dia]: typeof f === "function" ? f(x[d.dia] ?? new Set()) : f }));
  };
  const link = d ? (linkDe[d.dia] ?? null) : null;

  function elegirDia(nuevo: string) {
    setDia(nuevo);
  }

  async function mover(c: Candidato, nuevo: string) {
    if (!nuevo) return;
    try {
      await pedir("/api/reparto/mover", json("POST", { pedidoId: c.pedidoId, dia: nuevo }));
      toast.success(`Pedido ${c.numero} movido al ${new Date(`${nuevo}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", timeZone: "UTC" })}`);
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const zonaElegida = (c: Candidato) => {
    const id = zonaDe[c.pedidoId] ?? c.zona?.id ?? null;
    return d?.zonas.find((z) => z.id === id) ?? null;
  };
  const tildados = (d?.candidatos ?? []).filter((c) => elegidos.has(c.pedidoId));
  const totalSiEntrega = tildados.reduce((n, c) => n + (c.enHoja?.precio ?? zonaElegida(c)?.precio ?? 0), 0);
  const sinZona = tildados.filter((c) => !zonaElegida(c) && c.enHoja?.precio == null).length;

  async function cambiarZona(c: Candidato, zonaId: string) {
    setZonaDe((z) => ({ ...z, [c.pedidoId]: zonaId }));
    if (c.enHoja) {
      try {
        await pedir(`/api/reparto/envios/${c.enHoja.id}`, json("PATCH", { zonaId }));
        cargar();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Lo que cambió desde la última vez que se guardó la hoja: si no cambió nada, no hay que mandar nada.
  const nuevos = tildados.filter((c) => !c.enHoja).length;
  const quitados = (d?.candidatos ?? []).filter((c) => c.enHoja?.estado === "ofrecido" && !elegidos.has(c.pedidoId)).length;
  const cambios = nuevos + quitados;

  async function mandar(linkNuevo = false) {
    if (!d) return;
    if (linkNuevo && !confirm("¿Generar un link nuevo? El que ya le mandaste deja de andar y tenés que mandarle el nuevo. Lo que ya marcó no se pierde.")) return;
    setMandando(true);
    const delDia = d.dia;
    try {
      const res = await pedir<{ link: string | null; envios: number }>(
        "/api/reparto/hoja",
        json("POST", { dia: delDia, linkNuevo, elegidos: tildados.map((c) => ({ pedidoId: c.pedidoId, origen: c.origen, envioMl: c.envioMl, zonaId: zonaElegida(c)?.id ?? null })) })
      );
      if (res.link) {
        setLinkDe((x) => ({ ...x, [delDia]: res.link! }));
        toast.success(`Hoja lista con ${res.envios} ${res.envios === 1 ? "envío" : "envíos"}`);
      } else {
        toast.success("Guardado. Él lo ve en el mismo link: no hace falta mandárselo de nuevo.");
      }
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setMandando(false);
    }
  }

  if (!d)
    return (
      <div className="divide-y rounded-xl border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="ml-auto h-4 w-32" />
          </div>
        ))}
      </div>
    );

  const delDia = nombreDelDia(d.dia, d.hoy, true);
  const delDiaTexto = d.dia === d.hoy ? "de hoy" : d.dia === d.proximos[1]?.dia ? "de mañana" : `del ${delDia}`;
  const mensaje = link ? `Hola! Estos son los envíos ${delDiaTexto}. Marcá cuáles llevás y después cuáles entregaste: ${link}` : "";
  const respondidos = d.candidatos.filter((c) => c.enHoja && c.enHoja.estado !== "ofrecido").length;

  return (
    <div className="space-y-4">
      {/* El día: se le puede mandar la hoja de mañana hoy (decisión de Agustín, 2026-11-23). */}
      <div role="tablist" aria-label="Día de reparto" className="flex gap-2 overflow-x-auto pb-1">
        {d.proximos.map((p) => {
          const puesto = p.dia === d.dia;
          const total = p.flex + p.web;
          return (
            <button
              key={p.dia}
              type="button"
              role="tab"
              aria-selected={puesto}
              onClick={() => elegirDia(p.dia)}
              className={`min-w-[104px] shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${puesto ? "border-primary ring-1 ring-primary" : "hover:border-foreground/20"} ${total ? "" : "opacity-60"}`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium first-letter:uppercase">
                {nombreDelDia(p.dia, d.hoy)}
                {p.hoja && <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2} aria-label="hoja mandada" />}
              </div>
              <div className="text-xs text-muted-foreground">
                {total ? (
                  <>
                    {p.flex > 0 && `${p.flex} Flex`}
                    {p.flex > 0 && p.web > 0 && " · "}
                    {p.web > 0 && `${p.web} web`}
                  </>
                ) : (
                  "nada"
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {delDia}
          {d.dia === d.hoy && " (con los atrasados)"}
          {d.hoja?.enviadaEn && ` · hoja mandada a las ${hora(d.hoja.enviadaEn)} · ${respondidos} respondidos`}
        </p>
        <Button size="sm" variant="ghost" onClick={() => cargar()} disabled={cargando}>
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />}
          Actualizar
        </Button>
      </div>

      {!d.candidatos.length ? (
        <EmptyState icon={Truck} title="No hay envíos para ese día" description="Ni Flex de Mercado Libre ni mensajería de la web con despacho ese día. Elegí otro día arriba." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden items-center gap-4 border-b px-4 py-2 text-xs text-muted-foreground md:grid md:grid-cols-[20px_88px_minmax(0,1fr)_150px_110px_110px]">
            <input
              type="checkbox"
              className="accent-primary"
              aria-label="Elegir todos"
              checked={tildados.length === d.candidatos.length}
              onChange={() => setElegidos(tildados.length === d.candidatos.length ? new Set() : new Set(d.candidatos.map((c) => c.pedidoId)))}
            />
            <span>Envío</span>
            <span>Qué y dónde</span>
            <span>Zona</span>
            <span className="text-right">Te deja</span>
            <span className="text-right">Repartidor</span>
          </div>
          <ul className="divide-y">
            {d.candidatos.map((c) => {
              const z = zonaElegida(c);
              const pago = c.enHoja?.precio ?? z?.precio ?? null;
              const deja = c.ingreso != null && pago != null ? c.ingreso - pago : null;
              return (
                <li key={c.pedidoId} className={`grid grid-cols-[20px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[20px_88px_minmax(0,1fr)_150px_110px_110px] ${elegidos.has(c.pedidoId) ? "" : "opacity-60"}`}>
                  <input
                    type="checkbox"
                    className="accent-primary"
                    aria-label={`Elegir ${c.numero}`}
                    checked={elegidos.has(c.pedidoId)}
                    onChange={() =>
                      setElegidos((s) => {
                        const n = new Set(s);
                        if (n.has(c.pedidoId)) n.delete(c.pedidoId);
                        else n.add(c.pedidoId);
                        return n;
                      })
                    }
                  />
                  <div className="text-sm">
                    {c.origen === "flex" ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Zap className="h-3.5 w-3.5" strokeWidth={2} />
                        Flex{c.conHora && c.hasta ? <span className="font-mono tabular-nums"> {hora(c.hasta)}</span> : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Web</span>
                    )}
                  </div>
                  <div className="col-start-2 min-w-0 md:col-start-auto">
                    <p className="truncate text-sm">
                      {c.productos.map((p) => `${p.cantidad > 1 ? `${p.cantidad} × ` : ""}${p.nombre}`).join(" + ")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.localidad ?? "sin localidad"} · {c.origen === "flex" ? "venta" : "pedido"} {c.numero}
                      {c.estadoPedido && ` · ${ESTADO_PEDIDO[c.estadoPedido] ?? c.estadoPedido}`}
                      {c.etiqueta === "en_fabricacion" && " · ML todavía no liberó la etiqueta (fecha estimada)"}
                      {c.enHoja && (
                        <>
                          {" · "}
                          <span className={ESTADO[c.enHoja.estado]?.clase}>{ESTADO[c.enHoja.estado]?.texto}</span>
                        </>
                      )}
                    </p>
                    {c.origen === "web" && (!c.enHoja || c.enHoja.estado === "ofrecido") && (
                      <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        Mover a otro día
                        <input
                          type="date"
                          min={d.hoy}
                          defaultValue={c.fecha ?? undefined}
                          onChange={(e) => e.target.value && e.target.value !== c.fecha && mover(c, e.target.value)}
                          className="h-6 rounded-md border bg-transparent px-1.5 text-xs"
                          aria-label="Mover a otro día"
                        />
                      </label>
                    )}
                  </div>
                  <div className="col-start-2 md:col-start-auto">
                    <select
                      value={z?.id ?? ""}
                      onChange={(e) => cambiarZona(c, e.target.value)}
                      disabled={!!c.enHoja && c.enHoja.estado === "entregado"}
                      className={`h-8 w-full rounded-md border bg-transparent px-2 text-sm ${z ? "" : "border-amber-500/60"}`}
                      aria-label="Zona"
                    >
                      {!z && <option value="">Elegí la zona</option>}
                      {d.zonas.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nombre} · {pesos(x.precio)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-start-2 text-sm md:col-start-auto md:text-right">
                    {deja != null ? (
                      <span className={`font-mono tabular-nums ${deja < 0 ? "text-amber-600 dark:text-amber-400" : ""}`} title={`Entra ${pesos(c.ingreso!)}`}>
                        {deja >= 0 ? "" : "−"}
                        {pesos(Math.abs(deja))}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{c.origen === "flex" ? "bonif. sin llegar" : "—"}</span>
                    )}
                  </div>
                  <div className="col-start-2 font-mono text-sm tabular-nums md:col-start-auto md:text-right">{pago != null ? pesos(pago) : "—"}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {link && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm">
            Link {delDiaTexto} listo. Vale hasta el final del día siguiente. Si después cambiás algo, él lo ve en este mismo link.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} /> Mandar por WhatsApp
            </a>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copiado"))}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Copiar link
            </Button>
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} /> Ver como él
            </a>
          </div>
        </div>
      )}

      {d.candidatos.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 rounded-xl border bg-popover p-2 pl-4 shadow-lg">
          <span className="text-sm">
            <span className="font-mono tabular-nums">{tildados.length}</span> {tildados.length === 1 ? "envío" : "envíos"} ·{" "}
            <span className="font-mono tabular-nums">{pesos(totalSiEntrega)}</span> si los entrega
            {sinZona > 0 && <span className="text-amber-600 dark:text-amber-400"> · {sinZona} sin zona</span>}
          </span>
          {!d.hoja?.enviadaEn ? (
            <Button size="sm" onClick={() => mandar()} disabled={mandando || !tildados.length}>
              {mandando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" strokeWidth={1.5} />}
              Mandar la hoja {delDiaTexto}
            </Button>
          ) : cambios > 0 ? (
            <Button size="sm" onClick={() => mandar()} disabled={mandando || !tildados.length}>
              {mandando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={2} />}
              Guardar cambios
              <span className="font-normal opacity-80">
                ({[nuevos && `+${nuevos}`, quitados && `−${quitados}`].filter(Boolean).join(" ")})
              </span>
            </Button>
          ) : (
            <>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" strokeWidth={2} /> Ya la tiene
              </span>
              <Button size="sm" variant="ghost" onClick={() => mandar(true)} disabled={mandando} title="Si perdiste el link: genera otro y el anterior deja de andar">
                {mandando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />}
                Link nuevo
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Semanas ───────────────────────────────────────────────────────────

function Semanas() {
  const [s, setS] = useState<Semana[] | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const cargar = useCallback(() => {
    pedir<{ semanas: Semana[] }>("/api/reparto/semanas")
      .then((r) => setS(r.semanas))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  function resumen(w: Semana) {
    const lineas = w.porZona.map((z) => `${z.entregados} ${z.zona} × ${pesos(z.precio)} = ${pesos(z.subtotal)}`);
    return `Semana del ${fechaCorta(w.desde)} al ${fechaCorta(w.hasta)}:\n${lineas.join("\n")}\nTotal: ${pesos(w.total)} (${w.entregados} ${w.entregados === 1 ? "envío entregado" : "envíos entregados"})`;
  }

  async function pagar(w: Semana) {
    if (!confirm(`¿Marcar pagada la semana del ${fechaCorta(w.desde)} al ${fechaCorta(w.hasta)} por ${pesos(w.total)}?`)) return;
    setPagando(w.desde);
    try {
      await pedir("/api/reparto/liquidar", json("POST", { desde: w.desde }));
      toast.success("Semana marcada como pagada");
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPagando(null);
    }
  }

  if (!s) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!s.length) return <EmptyState icon={Truck} title="Todavía no hay semanas" description="Aparecen cuando el repartidor marque sus primeros envíos." />;

  return (
    <div className="space-y-4">
      {s.map((w) => {
        const deja = w.ganancia.ingreso - w.ganancia.pago;
        return (
          <section key={w.desde} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b p-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Semana del {fechaCorta(w.desde)} al {fechaCorta(w.hasta)}
                </p>
                <p className="font-mono text-[28px] leading-none font-medium tabular-nums">{pesos(w.total)}</p>
                <p className="text-sm text-muted-foreground">
                  {w.entregados} {w.entregados === 1 ? "entregado" : "entregados"}
                  {w.noEntregados > 0 && ` · ${w.noEntregados} no se pudieron (no se pagan)`}
                  {w.sinCerrar > 0 && ` · ${w.sinCerrar} sin cerrar`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={!w.entregados} onClick={() => navigator.clipboard.writeText(resumen(w)).then(() => toast.success("Resumen copiado"))}>
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.5} /> Copiar resumen
                </Button>
                {w.liquidacion && w.total <= w.liquidacion.total ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-primary">
                    <Check className="h-4 w-4" strokeWidth={2} /> Pagada el {new Date(w.liquidacion.pagadoEn).toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric", month: "numeric" })}
                  </span>
                ) : (
                  <Button size="sm" onClick={() => pagar(w)} disabled={!w.entregados || pagando === w.desde}>
                    {pagando === w.desde && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Marcar pagada
                  </Button>
                )}
              </div>
            </div>
            {w.porZona.length > 0 && (
              <ul className="divide-y text-sm">
                {w.porZona.map((z) => (
                  <li key={z.zona + z.precio} className="flex items-center gap-4 px-4 py-2">
                    <span className="min-w-0 flex-1">{z.zona}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {z.entregados} × {pesos(z.precio)}
                    </span>
                    <span className="w-24 text-right font-mono tabular-nums">{pesos(z.subtotal)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1 border-t px-4 py-3 text-sm">
              {w.ganancia.conDato > 0 ? (
                <p>
                  Te dejó <span className={`font-mono tabular-nums ${deja < 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{deja < 0 ? "−" : ""}{pesos(Math.abs(deja))}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · entró {pesos(w.ganancia.ingreso)} (bonificación Flex o envío cobrado en la web) y se le pagan {pesos(w.ganancia.pago)}, de {w.ganancia.conDato} {w.ganancia.conDato === 1 ? "envío" : "envíos"} con dato
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">Cuánto te dejó aparece cuando llega la bonificación Flex de ML.</p>
              )}
              {w.noCoincidenMl.length > 0 && (
                <p className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w.noCoincidenMl.length} Flex marcados entregados que Mercado Libre todavía no da como entregados: {w.noCoincidenMl.join(", ")}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Tarifas ───────────────────────────────────────────────────────────

function Tarifas() {
  const [zonas, setZonas] = useState<Array<{ id: string; nombre: string; precio: number }> | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const cargar = useCallback(() => {
    pedir<Pick<Dia, "zonas">>("/api/reparto/zonas")
      .then((r) => {
        setZonas(r.zonas);
        setV(Object.fromEntries(r.zonas.map((z) => [z.id, String(z.precio)])));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  const cambios = useMemo(() => (zonas ?? []).filter((z) => Number(v[z.id]) !== z.precio && v[z.id] !== "").map((z) => ({ id: z.id, precio: Number(v[z.id]) })), [zonas, v]);

  async function guardar() {
    setGuardando(true);
    try {
      await pedir("/api/reparto/zonas", json("PUT", { cambios }));
      toast.success("Tarifas guardadas. Lo ya ofrecido mantiene su precio");
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (!zonas) return <Skeleton className="h-48 w-full max-w-xl rounded-xl" />;
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">Lo que se le paga por cada envío entregado, según la zona (lista de SyB Logística). La zona sale sola del código postal y la localidad; se puede corregir en cada envío.</p>
      <ul className="divide-y rounded-xl border bg-card">
        {zonas.map((z) => (
          <li key={z.id} className="flex items-center gap-4 px-4 py-3">
            <span className="min-w-0 flex-1 text-sm">{z.nombre}</span>
            <div className="relative w-36">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <Input inputMode="numeric" value={v[z.id] ?? ""} onChange={(e) => setV((x) => ({ ...x, [z.id]: e.target.value.replace(/\D/g, "") }))} className="h-8 pl-6 text-right font-mono tabular-nums" />
            </div>
          </li>
        ))}
      </ul>
      <Button size="sm" disabled={!cambios.length || guardando} onClick={guardar}>
        {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
      </Button>
    </div>
  );
}
