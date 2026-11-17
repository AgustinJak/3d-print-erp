"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Box, Download, Eye, Library, Loader2, Pencil, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Visor3d } from "@/components/archivos/visor-3d";
import { descargar, linkDe, subirModelo } from "@/components/archivos/subir";
import { json, pedir } from "@/components/producto/seccion";
import { tamanoLegible } from "@/lib/tareas-reglas";
import type { ArchivoDePieza } from "@/lib/archivos-de-piezas";
import type { MaterialDeBodega, RecetaDePieza } from "@/lib/recetas-de-piezas";
import { parsePrice } from "@/lib/utils";

/** Lo que trae GET /api/piezas para todas las piezas de un producto. */
export interface InfoDePiezas {
  archivos: Record<string, ArchivoDePieza>;
  recetas: Record<string, RecetaDePieza>;
  materiales: MaterialDeBodega[];
}
import type { ArchivoVista } from "@/lib/tareas";

/**
 * El archivo 3D de una pieza de Bodega (docs/sdd/014, spec 001): la miniatura de su placa, verlo en
 * 3D, bajarlo, subir otro, elegir uno de la biblioteca (los colores comparten modelo) y, si el 3MF
 * tiene varias placas, cuál es la de esta pieza.
 */

const CARPETA = "Modelos";
const ACEPTA = ".3mf,.stl,.obj";
const selectClase =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

const nombreDePlaca = (p: { n: number; nombre: string }) => p.nombre || `Placa ${p.n}`;
const duracion = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

export function ArchivoDePiezaBloque({ piezaId, info, onCambio }: { piezaId: string; info: InfoDePiezas; onCambio: () => void }) {
  const archivo: ArchivoDePieza | undefined = info.archivos[piezaId];
  const receta: RecetaDePieza | undefined = info.recetas[piezaId];
  const [ocupado, setOcupado] = useState<null | "subiendo" | "guardando">(null);
  const [viendo, setViendo] = useState<{ url: string } | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function enganchar(archivoId: string | null, placa: number | null, aviso: string) {
    setOcupado("guardando");
    try {
      await pedir(`/api/piezas/${piezaId}/archivo`, json("PUT", { archivoId, placa }));
      toast.success(aviso);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(null);
    }
  }

  async function subir(file: File) {
    setOcupado("subiendo");
    try {
      const r = await subirModelo(file, CARPETA);
      await pedir(`/api/piezas/${piezaId}/archivo`, json("PUT", { archivoId: r.id, placa: null }));
      toast.success(r.yaEstaba ? "Ese archivo ya estaba en la biblioteca: quedó enganchado" : "Archivo subido");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setOcupado(null);
      if (input.current) input.current.value = "";
    }
  }

  async function ver() {
    if (!archivo) return;
    try {
      const { url } = await linkDe(archivo.archivoId, false);
      setViendo({ url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir");
    }
  }

  const placa = archivo?.placa != null ? archivo.placas.find((p) => p.n === archivo.placa) : null;
  const laminado = placa ?? (archivo && archivo.placas.length === 1 ? archivo.placas[0] : null);

  return (
    <div className="rounded-md border border-dashed p-2">
      <input ref={input} type="file" accept={ACEPTA} className="hidden" onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} />
      {archivo ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={ver}
              className="h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted transition-opacity hover:opacity-80"
              title="Ver en 3D"
              aria-label="Ver en 3D"
            >
              {archivo.miniatura ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={archivo.miniatura} alt="" className="h-full w-full object-contain" />
              ) : (
                <Box className="m-auto h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={archivo.nombre}>
                {archivo.nombre}
              </p>
              <p className="text-xs text-muted-foreground">
                {tamanoLegible(archivo.tamano)}
                {placa && <> · {nombreDePlaca(placa)}</>}
                {archivo.compartidoPor > 1 && <> · lo usan {archivo.compartidoPor} piezas</>}
                {laminado?.gramos != null && (
                  <>
                    {" "}
                    · laminado: {laminado.gramos} g{laminado.segundos != null ? `, ${duracion(laminado.segundos)}` : ""}
                  </>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={ver} title="Ver en 3D" aria-label="Ver en 3D">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => descargar(archivo.archivoId)} title="Bajar" aria-label="Bajar el archivo">
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!!ocupado} onClick={() => input.current?.click()} title="Subir otro" aria-label="Subir otro archivo">
                {ocupado === "subiendo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!!ocupado} onClick={() => setEligiendo(true)} title="Elegir de la biblioteca" aria-label="Elegir de la biblioteca">
                <Library className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={!!ocupado}
                onClick={() => confirm("¿Quitarle el archivo a esta pieza? El archivo queda en la biblioteca.") && enganchar(null, null, "Archivo quitado")}
                title="Quitar"
                aria-label="Quitar el archivo"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {archivo.placas.length > 1 && (
            <select
              className={selectClase}
              value={archivo.placa ?? ""}
              disabled={!!ocupado}
              onChange={(e) => enganchar(archivo.archivoId, e.target.value ? Number(e.target.value) : null, "Placa guardada")}
              aria-label="Placa de esta pieza"
            >
              <option value="">Todo el archivo ({archivo.placas.length} placas)</option>
              {archivo.placas.map((p) => (
                <option key={p.n} value={p.n}>
                  {nombreDePlaca(p)}
                  {p.nombre ? ` (placa ${p.n})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Sin archivo 3D</p>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={!!ocupado} onClick={() => input.current?.click()}>
              {ocupado === "subiendo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {ocupado === "subiendo" ? "Subiendo…" : "Subir"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" disabled={!!ocupado} onClick={() => setEligiendo(true)}>
              <Library className="h-3.5 w-3.5" /> De la biblioteca
            </Button>
          </div>
        </div>
      )}

      {receta && (
        <RecetaFila
          piezaId={piezaId}
          receta={receta}
          materiales={info.materiales}
          laminado={laminado?.gramos != null ? { gramos: laminado.gramos, segundos: laminado.segundos } : null}
          onCambio={onCambio}
        />
      )}

      <Dialog open={!!viendo} onOpenChange={(o) => !o && setViendo(null)}>
        <DialogContent className="sm:max-w-3xl">
          {viendo && archivo && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">{archivo.nombre}</DialogTitle>
                <DialogDescription>
                  {tamanoLegible(archivo.tamano)}
                  {placa ? ` · esta pieza es ${nombreDePlaca(placa)}` : ""} · arrastrá para girarlo
                </DialogDescription>
              </DialogHeader>
              <div className="h-[60vh] min-h-[320px]">
                <Visor3d url={viendo.url} extension={archivo.extension ?? ""} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViendo(null)}>
                  Cerrar
                </Button>
                <Button onClick={() => descargar(archivo.archivoId)}>
                  <Download className="h-4 w-4" strokeWidth={1.5} /> Bajar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ElegirDeLaBiblioteca
        abierto={eligiendo}
        onCerrar={() => setEligiendo(false)}
        onElegir={(id) => {
          setEligiendo(false);
          enganchar(id, null, "Archivo enganchado");
        }}
      />
    </div>
  );
}

/**
 * La receta de la pieza (docs/sdd/014, spec 003, REQ-7): gramos, tiempo, material e insumos. Se
 * edita acá desde el 2026-11-16; la Bodega la baja. Guardarla recalcula los costos.
 */
function RecetaFila({
  piezaId,
  receta,
  materiales,
  laminado,
  onCambio,
}: {
  piezaId: string;
  receta: RecetaDePieza;
  materiales: MaterialDeBodega[];
  laminado: { gramos: number; segundos: number | null } | null;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [v, setV] = useState({ gramos: "", horas: "", minutos: "", materialId: "", insumos: "" });

  const porDefecto = materiales.find((m) => m.porDefecto);
  const material = materiales.find((m) => m.id === receta.materialId);
  const pesos = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
  const falta = receta.gramos == null || receta.segundos == null;
  const distintoDeLoLaminado =
    laminado && (receta.gramos !== laminado.gramos || (laminado.segundos != null && receta.segundos !== laminado.segundos));

  function abrir() {
    setV({
      gramos: receta.gramos?.toString() ?? "",
      horas: receta.segundos != null ? String(Math.floor(receta.segundos / 3600)) : "",
      minutos: receta.segundos != null ? String(Math.round((receta.segundos % 3600) / 60)) : "",
      materialId: receta.materialId ?? "",
      insumos: receta.insumos?.toString() ?? "",
    });
    setEditando(true);
  }

  async function guardar(cambio: Record<string, unknown>, aviso: string) {
    setGuardando(true);
    try {
      await pedir(`/api/piezas/${piezaId}`, json("PATCH", cambio));
      toast.success(aviso);
      setEditando(false);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const num = (s: string) => (s.trim() ? parsePrice(s) : null);

  if (editando) {
    const horas = num(v.horas) ?? 0;
    const minutos = num(v.minutos) ?? 0;
    const sinTiempo = !v.horas.trim() && !v.minutos.trim();
    return (
      <form
        className="mt-2 space-y-2 border-t pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          guardar(
            { gramos: num(v.gramos), segundos: sinTiempo ? null : Math.round((horas * 60 + minutos) * 60), materialId: v.materialId || null, insumos: num(v.insumos) },
            "Receta guardada"
          );
        }}
      >
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-[72px_64px_64px_minmax(0,1fr)_88px]">
          <Input value={v.gramos} onChange={(e) => setV({ ...v, gramos: e.target.value })} inputMode="decimal" placeholder="g" aria-label="Gramos" className="h-8" autoFocus />
          <Input value={v.horas} onChange={(e) => setV({ ...v, horas: e.target.value })} inputMode="decimal" placeholder="h" aria-label="Horas" className="h-8" />
          <Input value={v.minutos} onChange={(e) => setV({ ...v, minutos: e.target.value })} inputMode="decimal" placeholder="min" aria-label="Minutos" className="h-8" />
          <select value={v.materialId} onChange={(e) => setV({ ...v, materialId: e.target.value })} className={`${selectClase} col-span-2 sm:col-span-1`} aria-label="Material">
            <option value="">{porDefecto ? `Por defecto (${porDefecto.nombre})` : "Por defecto"}</option>
            {materiales.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} · {pesos(m.precioKg)} el kilo
              </option>
            ))}
          </select>
          <Input value={v.insumos} onChange={(e) => setV({ ...v, insumos: e.target.value })} inputMode="decimal" placeholder="$ insumos" aria-label="Insumos por unidad" className="h-8" />
        </div>
        <div className="flex justify-end gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={guardando}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar receta
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
      <p className={`text-xs ${falta ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
        {falta ? (
          "Falta la receta: sin gramos y tiempo no se calcula el costo"
        ) : (
          <>
            <span className="font-mono tabular-nums">{receta.gramos} g</span> · <span className="font-mono tabular-nums">{duracion(receta.segundos!)}</span> ·{" "}
            {material?.nombre ?? (porDefecto ? `${porDefecto.nombre} (por defecto)` : "material por defecto")}
            {receta.insumos ? (
              <>
                {" "}
                · insumos <span className="font-mono tabular-nums">{pesos(receta.insumos)}</span>
              </>
            ) : null}
          </>
        )}
      </p>
      <div className="flex items-center gap-1">
        {distintoDeLoLaminado && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={guardando}
            onClick={() => guardar({ gramos: laminado!.gramos, ...(laminado!.segundos != null ? { segundos: laminado!.segundos } : {}) }, "Receta tomada del archivo")}
            title="Los gramos y el tiempo que dejó Bambu Studio al laminar"
          >
            Usar lo laminado: {laminado!.gramos} g{laminado!.segundos != null ? `, ${duracion(laminado!.segundos)}` : ""}
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={abrir} title="Editar la receta" aria-label="Editar la receta">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** La biblioteca, para elegir un archivo que ya está (el mismo modelo para varios colores). */
function ElegirDeLaBiblioteca({ abierto, onCerrar, onElegir }: { abierto: boolean; onCerrar: () => void; onElegir: (id: string) => void }) {
  const [lista, setLista] = useState<ArchivoVista[] | null>(null);
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    if (!abierto || lista) return;
    pedir<{ archivos: ArchivoVista[] }>("/api/archivos")
      .then((r) => setLista(r.archivos))
      .catch(() => setLista([]));
  }, [abierto, lista]);

  const filtrada = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (lista ?? []).filter((a) => !q || a.nombre.toLowerCase().includes(q) || (a.carpeta ?? "").toLowerCase().includes(q) || a.etiquetas.some((e) => e.toLowerCase().includes(q)));
  }, [lista, buscar]);

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Elegir de la biblioteca</DialogTitle>
          <DialogDescription>Para usar el mismo modelo en varias piezas, como los colores.</DialogDescription>
        </DialogHeader>
        <Input autoFocus value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, carpeta o etiqueta" />
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {lista === null && <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>}
          {lista && filtrada.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No hay archivos con eso</p>}
          {filtrada.slice(0, 100).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onElegir(a.id)}
              className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted"
            >
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded border bg-muted">
                {a.miniatura ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.miniatura} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Box className="m-auto mt-2.5 h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm">{a.nombre}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {tamanoLegible(a.tamano)}
                  {a.carpeta ? ` · ${a.carpeta}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
