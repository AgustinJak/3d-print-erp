"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUp, Loader2, Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { json, pedir } from "@/components/producto/seccion";
import type { BusquedaDescubierta, Descubrir as DatosDescubrir, Destacada, Vidriera } from "@/lib/tendencias-descubrir";
import { BuscarModelos } from "./buscar-modelos";

/**
 * "Descubrir" (docs/sdd/016, 2026-11-20): lo que sube en las categorías de ML donde entra lo que se
 * imprime, para sacar productos nuevos. Lo que ya tenés queda aparte y apagado, así salta lo nuevo.
 */

const MOSTRAR = 10;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Descubrir({
  datos,
  onAbrirTema,
  onCambio,
  onCategoriasGuardadas,
}: {
  datos: DatosDescubrir | null;
  onAbrirTema: (id: string) => void;
  onCambio: () => void;
  onCategoriasGuardadas: () => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [modelos, setModelos] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [categorias, setCategorias] = useState(false);

  async function seguir(b: BusquedaDescubierta) {
    try {
      const r = await pedir<{ id: string }>("/api/tendencias/temas", json("POST", { nombre: capital(b.palabra), palabra: b.palabra }));
      toast.success(`Seguís «${b.palabra}»: queda como tema y la ves en Mis temas`);
      onCambio();
      onAbrirTema(r.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function descartar(b: BusquedaDescubierta) {
    setOcultas((s) => new Set(s).add(b.normalizada));
    setAbierta(null);
    try {
      await pedir("/api/tendencias/busquedas", json("POST", { palabra: b.palabra, accion: "descartar" }));
      toast(`«${b.palabra}» no vuelve a aparecer`, {
        action: {
          label: "Deshacer",
          onClick: () =>
            pedir("/api/tendencias/busquedas", json("POST", { palabra: b.palabra, accion: "volver" })).then(() =>
              setOcultas((s) => {
                const n = new Set(s);
                n.delete(b.normalizada);
                return n;
              })
            ),
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const acciones = (b: BusquedaDescubierta) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="xs" variant="outline" onClick={() => setModelos(b.palabra)}>
        <Search className="h-3 w-3" strokeWidth={1.5} /> Buscar modelos
      </Button>
      <Link href={`/modelos/nuevo?${new URLSearchParams({ nombre: capital(b.palabra) })}`} className={buttonVariants({ size: "xs" })}>
        <Plus className="h-3 w-3" strokeWidth={1.5} /> Crear producto
      </Link>
      {b.tema ? (
        <Button size="xs" variant="ghost" onClick={() => onAbrirTema(b.tema!.id)}>
          Abrir {b.tema.nombre}
        </Button>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => seguir(b)}>
          <Star className="h-3 w-3" strokeWidth={1.5} /> Seguir
        </Button>
      )}
      <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => descartar(b)}>
        <X className="h-3 w-3" /> Descartar
      </Button>
    </div>
  );

  if (!datos)
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    );

  const destacadas = datos.destacadas.filter((d) => !ocultas.has(d.normalizada));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {datos.fotoMl
            ? `Las búsquedas que más crecieron en la semana en cada categoría, según ML el ${new Date(`${datos.fotoMl}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" })}.`
            : "Todavía no hay búsquedas leídas: tocá Actualizar."}
          {datos.fotoMl && !datos.conComparacion && " Lo nuevo y lo que sube se marca cuando haya una semana de fotos."}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setCategorias(true)}>
          <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} /> Elegir categorías
        </Button>
      </div>

      {destacadas.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium">Lo que más suena</h2>
            <p className="text-xs text-muted-foreground">Lo que no tenés, sumando todas las categorías: más arriba, en varias o varios días seguidos</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {destacadas.map((d) => (
              <TarjetaDestacada key={d.normalizada} d={d} abierta={abierta === `d|${d.normalizada}`} onAlternar={() => setAbierta(abierta === `d|${d.normalizada}` ? null : `d|${d.normalizada}`)} acciones={acciones(d)} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {datos.vidrieras.map((v) => (
          <TarjetaVidriera key={v.id} v={v} ocultas={ocultas} abierta={abierta} setAbierta={setAbierta} acciones={acciones} onAbrirTema={onAbrirTema} />
        ))}
      </div>

      <Dialog open={!!modelos} onOpenChange={(o) => !o && setModelos(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modelos para «{modelos}»</DialogTitle>
            <DialogDescription>Printables, Thingiverse, Cults y MyMiniFactory</DialogDescription>
          </DialogHeader>
          {modelos && <BuscarModelos key={modelos} inicial={modelos} buscarAlAbrir />}
        </DialogContent>
      </Dialog>

      {categorias && (
        <ElegirCategorias
          onCerrar={() => setCategorias(false)}
          onGuardado={() => {
            setCategorias(false);
            onCategoriasGuardadas();
          }}
        />
      )}
    </div>
  );
}

function Movimiento({ b }: { b: BusquedaDescubierta }) {
  if (b.nueva) return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Nueva esta semana" />;
  if (b.posicionAntes != null && b.posicionAntes - b.posicion >= 5)
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-foreground" title={`Estaba #${b.posicionAntes} hace una semana`}>
        <ArrowUp className="h-3 w-3 text-primary" strokeWidth={2} />
        {b.posicionAntes - b.posicion}
      </span>
    );
  return null;
}

function TarjetaDestacada({ d, abierta, onAlternar, acciones }: { d: Destacada; abierta: boolean; onAlternar: () => void; acciones: React.ReactNode }) {
  return (
    <div className={`rounded-xl border bg-card transition-colors ${abierta ? "border-foreground/20" : "hover:border-foreground/20"}`}>
      <button type="button" onClick={onAlternar} aria-expanded={abierta} className="w-full space-y-1 p-3 text-left">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.palabra}</span>
          <Movimiento b={d} />
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{d.posicion}</span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {d.categorias.join(" · ")}
          {d.dias > 1 && ` · ${d.dias} días`}
          {d.tema && ` · seguís ${d.tema.nombre}`}
        </p>
      </button>
      {abierta && <div className="border-t px-3 py-2.5">{acciones}</div>}
    </div>
  );
}

function TarjetaVidriera({
  v,
  ocultas,
  abierta,
  setAbierta,
  acciones,
  onAbrirTema,
}: {
  v: DatosDescubrir["vidrieras"][number];
  ocultas: Set<string>;
  abierta: string | null;
  setAbierta: (k: string | null) => void;
  acciones: (b: BusquedaDescubierta) => React.ReactNode;
  onAbrirTema: (id: string) => void;
}) {
  const [todas, setTodas] = useState(false);
  const visibles = v.busquedas.filter((b) => !ocultas.has(b.normalizada));
  const nuevas = visibles.filter((b) => !b.tema?.conProductos);
  const tuyas = visibles.filter((b) => b.tema?.conProductos);
  const temasTuyos = [...new Map(tuyas.map((b) => [b.tema!.id, b.tema!])).values()];
  const lista = todas ? visibles : nuevas.slice(0, MOSTRAR);

  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h3 className="truncate text-sm font-medium">{v.nombre}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {v.nuevas > 0 ? (
            <>
              <span className="font-mono text-foreground tabular-nums">{v.nuevas}</span> nuevas
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums">{visibles.length}</span> búsquedas
            </>
          )}
        </span>
      </div>
      {!visibles.length ? (
        <p className="p-4 text-sm text-muted-foreground">ML no trae búsquedas para esta categoría todavía.</p>
      ) : (
        <ul className="flex-1 px-2 py-1.5">
          {lista.map((b) => {
            const clave = `${v.id}|${b.normalizada}`;
            const open = abierta === clave;
            const tuya = !!b.tema?.conProductos;
            return (
              <li key={clave} className={`rounded-lg ${open ? "bg-muted/60" : ""}`}>
                <button
                  type="button"
                  onClick={() => setAbierta(open ? null : clave)}
                  aria-expanded={open}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 ${tuya ? "text-muted-foreground" : ""}`}
                >
                  <span className="w-7 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">#{b.posicion}</span>
                  <span className="min-w-0 flex-1 truncate">{b.palabra}</span>
                  <Movimiento b={b} />
                  {b.tema && <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">{tuya ? `ya tenés · ${b.tema.nombre}` : `seguís · ${b.tema.nombre}`}</span>}
                </button>
                {open && <div className="px-2 pt-0.5 pb-2.5 pl-11">{acciones(b)}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {(temasTuyos.length > 0 || visibles.length > MOSTRAR) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 text-xs text-muted-foreground">
          {temasTuyos.length > 0 && !todas && (
            <span className="min-w-0 flex-1">
              Ya tenés:{" "}
              {temasTuyos.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <button type="button" className="hover:text-foreground" onClick={() => onAbrirTema(t.id)}>
                    {t.nombre}
                  </button>
                </span>
              ))}{" "}
              ({tuyas.length})
            </span>
          )}
          {visibles.length > MOSTRAR && (
            <button type="button" className="ml-auto shrink-0 hover:text-foreground" onClick={() => setTodas(!todas)}>
              {todas ? "Ver menos" : `Ver las ${visibles.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ElegirCategorias({ onCerrar, onGuardado }: { onCerrar: () => void; onGuardado: () => void }) {
  const [opciones, setOpciones] = useState<Array<Vidriera & { grupo: string; elegida: boolean }> | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    pedir<{ opciones: Array<Vidriera & { grupo: string; elegida: boolean }> }>("/api/tendencias/vidrieras")
      .then((r) => {
        setOpciones(r.opciones);
        setElegidas(new Set(r.opciones.filter((o) => o.elegida).map((o) => o.id)));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, []);

  async function guardar() {
    setGuardando(true);
    try {
      await pedir("/api/tendencias/vidrieras", json("PUT", { ids: [...elegidas] }));
      toast.success("Categorías guardadas. Se leen ahora mismo");
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const grupos = opciones ? [...new Set(opciones.map((o) => o.grupo))] : [];
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Qué categorías mirar</DialogTitle>
          <DialogDescription>Las búsquedas que suben en estas categorías de Mercado Libre aparecen en Descubrir. Como mucho 25.</DialogDescription>
        </DialogHeader>
        {!opciones ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {grupos.map((g) => (
              <div key={g} className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{g}</p>
                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  {opciones
                    .filter((o) => o.grupo === g)
                    .map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={elegidas.has(o.id)}
                          onChange={(e) =>
                            setElegidas((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(o.id);
                              else n.delete(o.id);
                              return n;
                            })
                          }
                        />
                        <span className="truncate">{o.nombre}</span>
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{elegidas.size}</span> elegidas
          </span>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={guardando || !elegidas.size || elegidas.size > 25} onClick={guardar}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
