"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Truck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Segmentado } from "@/components/segmentado";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { Candidato, Dia, Semana } from "@/lib/reparto";

/**
 * Reparto (docs/sdd/018): el repartidor de Flex y de la mensajería de la web.
 * - Hoy: los envíos del día con zona y precio; se tildan y se le manda el link por WhatsApp.
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
          ["hoy", <>Hoy</>],
          ["semanas", <>Semanas</>],
          ["tarifas", <>Tarifas</>],
        ]}
      />
      {pestana === "hoy" ? <Hoy /> : pestana === "semanas" ? <Semanas /> : <Tarifas />}
    </motion.div>
  );
}

// ─── Hoy ───────────────────────────────────────────────────────────────

function Hoy() {
  const [d, setD] = useState<Dia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [zonaDe, setZonaDe] = useState<Record<string, string>>({});
  const [mandando, setMandando] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const cargar = useCallback(async (primera = false) => {
    setCargando(true);
    try {
      const r = await pedir<Dia>("/api/reparto/hoy");
      setD(r);
      // Por defecto, todos tildados (decisión de Agustín): lo ya ofrecido y lo nuevo.
      if (primera) setElegidos(new Set(r.candidatos.filter((c) => c.enHoja?.estado !== "rechazado").map((c) => c.pedidoId)));
    } catch (e) {
      toast.error(`No se pudo leer el día: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    cargar(true);
  }, [cargar]);

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

  async function mandar() {
    if (!d) return;
    setMandando(true);
    try {
      const r = await pedir<{ link: string; envios: number }>(
        "/api/reparto/hoja",
        json("POST", { elegidos: tildados.map((c) => ({ pedidoId: c.pedidoId, origen: c.origen, envioMl: c.envioMl, zonaId: zonaElegida(c)?.id ?? null })) })
      );
      setLink(r.link);
      toast.success(`Hoja lista con ${r.envios} ${r.envios === 1 ? "envío" : "envíos"}`);
      cargar();
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

  const mensaje = link ? `Hola! Estos son los envíos de hoy. Marcá cuáles llevás y después cuáles entregaste: ${link}` : "";
  const respondidos = d.candidatos.filter((c) => c.enHoja && c.enHoja.estado !== "ofrecido").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {new Date(`${d.dia}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
          {d.hoja?.enviadaEn && ` · hoja mandada a las ${hora(d.hoja.enviadaEn)} · ${respondidos} respondidos`}
        </p>
        <Button size="sm" variant="ghost" onClick={() => cargar()} disabled={cargando}>
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />}
          Actualizar
        </Button>
      </div>

      {!d.candidatos.length ? (
        <EmptyState icon={Truck} title="Hoy no hay envíos para el repartidor" description="Ni Flex de Mercado Libre para hoy ni mensajería de la web pendiente." />
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
                      {c.enHoja && (
                        <>
                          {" · "}
                          <span className={ESTADO[c.enHoja.estado]?.clase}>{ESTADO[c.enHoja.estado]?.texto}</span>
                        </>
                      )}
                    </p>
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
            Link de hoy listo. Vence en 48 horas; si lo volvés a mandar, el anterior deja de andar.
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
          <Button size="sm" onClick={mandar} disabled={mandando || !tildados.length}>
            {mandando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" strokeWidth={1.5} />}
            {d.hoja?.enviadaEn ? "Actualizar y mandar de nuevo" : "Mandar al repartidor"}
          </Button>
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
    pedir<Dia>("/api/reparto/hoy")
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
