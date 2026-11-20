"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarPlus, FileBox, Loader2, Plus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { json, pedir } from "@/components/producto/seccion";
import { ETIQUETA_DE_TIPO, TIPOS_DE_TEMA, diasHasta, type TipoDeTema } from "@/lib/temas";
import type { FichaDeTema } from "@/lib/tendencias-temas";
import { BuscarModelos } from "./buscar-modelos";
import { EtiquetaSenal, TIPO_DE_EVENTO, fechaLarga } from "./senal";

/**
 * La ficha de un tema (docs/sdd/016), al costado como la de Precios: qué dice ML, qué fechas
 * vienen, qué productos tenés y cómo venden, modelos para imprimir, y "Crear producto".
 */

function Seccion({ titulo, detalle, acciones, children }: { titulo: string; detalle?: React.ReactNode; acciones?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{titulo}</h3>
          {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
        </div>
        {acciones && <div className="flex flex-wrap gap-1.5">{acciones}</div>}
      </div>
      {children}
    </section>
  );
}

export function FichaTema({
  temaId,
  temas,
  onCerrar,
  onCambio,
}: {
  temaId: string | null;
  temas: Array<{ id: string; nombre: string }>;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  return (
    <Sheet open={!!temaId} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-[620px]">
        {temaId && <Contenido key={temaId} id={temaId} temas={temas} onCambio={onCambio} onCerrar={onCerrar} />}
      </SheetContent>
    </Sheet>
  );
}

function Contenido({ id, temas, onCambio, onCerrar }: { id: string; temas: Array<{ id: string; nombre: string }>; onCambio: () => void; onCerrar: () => void }) {
  const [f, setF] = useState<FichaDeTema | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    pedir<FichaDeTema>(`/api/tendencias/temas/${id}`)
      .then(setF)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = useCallback(
    async (cuerpo: Record<string, unknown>, aviso?: string) => {
      try {
        await pedir(`/api/tendencias/temas/${id}`, json("PATCH", cuerpo));
        if (aviso) toast.success(aviso);
        cargar();
        onCambio();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [id, cargar, onCambio]
  );

  if (error) return <p className="p-6 text-sm text-muted-foreground">No se pudo abrir el tema: {error}</p>;
  if (!f)
    return (
      <div className="space-y-4 p-6">
        <SheetTitle className="sr-only">Tema</SheetTitle>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );

  const t = f.tema;
  const foto = f.productos.find((p) => p.foto)?.foto ?? null;
  const ventas30 = f.productos.reduce((n, p) => n + p.ultimos30, 0);
  const ventasAntes = f.productos.reduce((n, p) => n + p.anteriores30, 0);
  const crear = `/modelos/nuevo?${new URLSearchParams({ nombre: t.nombre, serie: t.nombre })}`;

  return (
    <>
      <div className="flex gap-4 border-b p-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-medium text-muted-foreground/60">{t.nombre.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <SheetTitle className="pr-8 text-xl leading-tight font-medium">{t.nombre}</SheetTitle>
          <SheetDescription>
            {ETIQUETA_DE_TIPO[t.tipo] ?? t.tipo} · {f.productos.filter((p) => p.activo).length} productos activos ·{" "}
            <span className="font-mono tabular-nums">{ventas30}</span> vendidos en 30 días
            {ventasAntes > 0 && (
              <>
                {" "}
                (antes <span className="font-mono tabular-nums">{ventasAntes}</span>)
              </>
            )}
            {!t.activo && " · desactivado"}
          </SheetDescription>
          <div className="flex flex-wrap gap-1.5">
            {f.lectura.senales.map((s) => (
              <EtiquetaSenal key={s.clave + s.texto} s={s} />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-8 p-6">
        <div className="flex flex-wrap gap-2">
          <Link href={crear} className={buttonVariants({ size: "sm" })}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Crear producto
          </Link>
          <span className="self-center text-xs text-muted-foreground">Abre el alta con el nombre y la serie cargados</span>
        </div>

        <Seccion
          titulo="Mercado Libre"
          detalle={f.fotoMl ? `Búsquedas que suben, según la foto del ${new Date(`${f.fotoMl}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" })}` : "Todavía no hay una foto de ML: tocá Actualizar"}
        >
          {f.busquedas.length ? (
            <ul className="divide-y rounded-xl border">
              {f.busquedas.map((b) => (
                <li key={`${b.categoriaId}-${b.palabra}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">#{b.posicion}</span>
                  <span className="min-w-0 flex-1 truncate">{b.palabra}</span>
                  {b.nueva && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Nueva esta semana" />}
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{b.categoriaId === "MLA" ? "todo ML" : b.categoria}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ninguna búsqueda de esta semana coincide con el tema. Si la gente lo busca con otra palabra, sumala como alias abajo.</p>
          )}
          {Object.keys(f.constancia).length > 0 && (
            <p className="text-xs text-muted-foreground">
              En los últimos 30 días:{" "}
              {Object.entries(f.constancia)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([p, d]) => `«${p}» ${d} ${d === 1 ? "día" : "días"}`)
                .join(" · ")}
            </p>
          )}
        </Seccion>

        <Fechas f={f} temaId={id} onCambio={() => (cargar(), onCambio())} />

        <Seccion titulo="Tus productos" detalle="Los que tienen como serie uno de los alias del tema">
          {f.productos.length ? (
            <ul className="divide-y rounded-xl border">
              {f.productos.map((p) => (
                <li key={p.id}>
                  <Link href={`/modelos/${p.id}`} className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40 ${p.activo ? "" : "opacity-60"}`}>
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                      {p.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.foto} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <FileBox className="h-3.5 w-3.5 text-muted-foreground/40" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate">
                      {p.nombre}
                      {!p.activo && <span className="text-xs text-muted-foreground"> · inactivo</span>}
                    </span>
                    <span className="shrink-0 text-right font-mono text-xs tabular-nums">
                      {p.ultimos30}
                      <span className="text-muted-foreground"> / antes {p.anteriores30}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No tenés productos de este tema.</p>
          )}
        </Seccion>

        <Seccion titulo="Modelos para imprimir" detalle="Printables, Thingiverse, Cults y MyMiniFactory">
          <BuscarModelos inicial={t.nombre} />
        </Seccion>

        <EditarTema f={f} temas={temas} cambiar={cambiar} onUnido={onCerrar} />
      </div>
    </>
  );
}

function Fechas({ f, temaId, onCambio }: { f: FichaDeTema; temaId: string; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("concierto");
  const [fecha, setFecha] = useState("");
  const [anual, setAnual] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await pedir("/api/tendencias/eventos", json("POST", { titulo, tipo, fecha, anual, temaId }));
      toast.success("Fecha agregada");
      setAbierto(false);
      setTitulo("");
      setFecha("");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function sacar(id: string, manual: boolean) {
    try {
      await pedir(`/api/tendencias/eventos/${id}`, json("PATCH", manual ? { borrar: true } : { temaId: null }));
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Seccion
      titulo="Fechas"
      detalle="Estrenos, temporadas y recitales del próximo año"
      acciones={
        !abierto && (
          <Button size="sm" variant="ghost" onClick={() => setAbierto(true)}>
            <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.5} /> Agregar fecha
          </Button>
        )
      }
    >
      {abierto && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_150px]">
            <Input placeholder="Qué pasa, por ejemplo el recital en Buenos Aires" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-8" />
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-8 rounded-md border bg-transparent px-2 text-sm" aria-label="Tipo">
              {Object.entries(TIPO_DE_EVENTO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8" aria-label="Fecha" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" className="accent-primary" checked={anual} onChange={(e) => setAnual(e.target.checked)} /> Se repite cada año
            </label>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={guardando || titulo.trim().length < 2 || !fecha} onClick={guardar}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Agregar
            </Button>
          </div>
        </div>
      )}
      {f.eventos.length ? (
        <ul className="divide-y rounded-xl border">
          {f.eventos.map((e) => {
            const dias = diasHasta(e.fecha);
            return (
              <li key={e.id ?? e.titulo + e.fecha} className="group flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{fechaLarga(e.fecha)}</span>
                <span className="min-w-0 flex-1 truncate" title={e.descripcion ?? undefined}>
                  {e.titulo}
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · {TIPO_DE_EVENTO[e.tipo] ?? e.tipo}
                    {!e.enArgentina && " · fecha mundial"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{dias < 0 ? "pasó" : dias === 0 ? "hoy" : `en ${dias} d`}</span>
                {e.id && (
                  <button
                    type="button"
                    onClick={() => sacar(e.id!, e.fuente === "manual")}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                    title={e.fuente === "manual" ? "Borrar" : "Sacar del tema"}
                    aria-label={e.fuente === "manual" ? "Borrar la fecha" : "Sacar la fecha del tema"}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !abierto && <p className="text-sm text-muted-foreground">Sin fechas cerca. Un recital o una convención se agregan a mano.</p>
      )}
    </Seccion>
  );
}

function EditarTema({
  f,
  temas,
  cambiar,
  onUnido,
}: {
  f: FichaDeTema;
  temas: Array<{ id: string; nombre: string }>;
  cambiar: (c: Record<string, unknown>, aviso?: string) => Promise<boolean>;
  onUnido: () => void;
}) {
  const t = f.tema;
  const [nombre, setNombre] = useState(t.nombre);
  const [alias, setAlias] = useState("");
  const [unir, setUnir] = useState("");

  return (
    <Seccion titulo="El tema" detalle="Los alias juntan las series de tus productos, las búsquedas de ML y los títulos de estrenos. No cambian nada en los productos">
      <div className="space-y-4 rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Nombre</span>
            <div className="flex gap-2">
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8" />
              {nombre.trim() !== t.nombre && (
                <Button size="sm" onClick={() => cambiar({ nombre }, "Nombre cambiado")}>
                  Guardar
                </Button>
              )}
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Tipo</span>
            <select value={t.tipo} onChange={(e) => cambiar({ tipo: e.target.value as TipoDeTema })} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
              {TIPOS_DE_TEMA.map((x) => (
                <option key={x} value={x}>
                  {ETIQUETA_DE_TIPO[x]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Alias</span>
          <div className="flex flex-wrap gap-1.5">
            {t.alias.map((a) => (
              <span key={a} className="inline-flex h-6 items-center gap-1 rounded-md border pr-1 pl-2 text-xs">
                {a}
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  disabled={t.alias.length === 1}
                  onClick={() => cambiar({ alias: t.alias.filter((x) => x !== a) })}
                  aria-label={`Sacar el alias ${a}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await cambiar({ sumarAlias: alias })) setAlias("");
            }}
          >
            <Input placeholder="Otra forma de buscarlo: un personaje, el nombre en inglés" value={alias} onChange={(e) => setAlias(e.target.value)} className="h-8" />
            <Button type="submit" size="sm" variant="outline" disabled={alias.trim().length < 3}>
              Sumar
            </Button>
          </form>
        </div>

        <div className="flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="min-w-[200px] flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Unir con otro tema: sus alias y fechas pasan a este</span>
            <select value={unir} onChange={(e) => setUnir(e.target.value)} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
              <option value="">Elegir…</option>
              {temas
                .filter((x) => x.id !== t.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!unir}
            onClick={async () => {
              const otro = temas.find((x) => x.id === unir)?.nombre;
              if (!confirm(`¿Unir «${otro}» con «${t.nombre}»? «${otro}» deja de existir como tema aparte.`)) return;
              if (await cambiar({ unirCon: unir }, `«${otro}» quedó dentro de «${t.nombre}»`)) setUnir("");
            }}
          >
            Unir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={async () => {
              if (await cambiar({ activo: !t.activo }, t.activo ? "Tema desactivado: deja de sumar señales" : "Tema activado") && t.activo) onUnido();
            }}
          >
            {t.activo ? "Desactivar el tema" : "Activar el tema"}
          </Button>
        </div>
      </div>
    </Seccion>
  );
}
