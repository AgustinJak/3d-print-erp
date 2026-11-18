"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { desgloseDeFabricacion, type ParametrosCosto } from "@/lib/costos-formula";
import { CAMPOS_DEL_TALLER, type CampoDelTaller } from "@/lib/costos-taller";
import type { CostosDeFabricacion, MaterialDeFabricacion } from "@/lib/costos-de-fabricacion";
import { parsePrice } from "@/lib/utils";

/**
 * Precios › Costo de fabricación (desde el 2026-11-18; antes en la Configuración de la Bodega):
 * el precio por kilo de cada material y los parámetros del taller. Guardar recalcula el costo de
 * los productos y la Bodega lo baja sola; no publica ningún precio.
 */

const numeroATexto = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
type Respuesta = { ok: true; modelos: number };

function avisoDeGuardado(r: Respuesta) {
  toast.success(
    r.modelos
      ? `Guardado. ${r.modelos} ${r.modelos === 1 ? "producto tiene" : "productos tienen"} costo nuevo; no se publicó ningún precio.`
      : "Guardado. No se publicó ningún precio."
  );
}

function FilaMaterial({ m, onGuardado, ocupado, setOcupado }: { m: MaterialDeFabricacion; onGuardado: () => void; ocupado: string | null; setOcupado: (s: string | null) => void }) {
  const [nombre, setNombre] = useState(m.nombre);
  const [precio, setPrecio] = useState(numeroATexto(m.precioKg));
  const cambio = nombre.trim() !== m.nombre || parsePrice(precio) !== m.precioKg;

  async function guardar(extra: Partial<Pick<MaterialDeFabricacion, "porDefecto" | "activo">> = {}) {
    setOcupado(m.id);
    try {
      avisoDeGuardado(await pedir<Respuesta>("/api/costos/fabricacion", json("POST", { id: m.id, nombre, precioKg: parsePrice(precio), ...extra })));
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  return (
    <li className={`grid grid-cols-[20px_minmax(0,1fr)_120px] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[20px_minmax(0,1fr)_130px_auto] ${m.activo ? "" : "opacity-60"}`}>
      <input
        type="radio"
        name="material-por-defecto"
        className="accent-primary"
        checked={m.porDefecto}
        disabled={!m.activo || !!ocupado}
        onChange={() => guardar({ porDefecto: true })}
        aria-label={`Usar ${m.nombre} por defecto`}
        title={m.activo ? "Usar por defecto" : "Activalo para usarlo por defecto"}
      />
      <div className="min-w-0">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8" aria-label="Nombre del material" />
        <p className="mt-1 text-xs text-muted-foreground">
          {m.porDefecto ? "Por defecto · " : ""}
          {m.piezas} {m.piezas === 1 ? "pieza" : "piezas"}
          {m.activo ? "" : " · desactivado"}
        </p>
      </div>
      <label className="block">
        <span className="sr-only">Precio por kilo</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
          <Input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} className="h-8 pl-6 text-right font-mono tabular-nums" />
        </div>
        <span className="mt-1 block text-right text-xs text-muted-foreground">el kilo</span>
      </label>
      <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
        {cambio ? (
          <>
            <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={() => { setNombre(m.nombre); setPrecio(numeroATexto(m.precioKg)); }}>
              Descartar
            </Button>
            <Button size="sm" disabled={!!ocupado} onClick={() => guardar()}>
              {ocupado === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
            </Button>
          </>
        ) : (
          !m.porDefecto && (
            <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={!!ocupado} onClick={() => guardar({ activo: !m.activo })}>
              {m.activo ? "Desactivar" : "Activar"}
            </Button>
          )
        )}
      </div>
    </li>
  );
}

function MaterialNuevo({ onGuardado, ocupado, setOcupado }: { onGuardado: () => void; ocupado: string | null; setOcupado: (s: string | null) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  if (!abierto)
    return (
      <button type="button" onClick={() => setAbierto(true)} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
        <Plus className="h-4 w-4" strokeWidth={1.5} /> Agregar material
      </button>
    );
  async function crear() {
    setOcupado("nuevo");
    try {
      avisoDeGuardado(await pedir<Respuesta>("/api/costos/fabricacion", json("POST", { nombre, precioKg: parsePrice(precio) })));
      setAbierto(false);
      setNombre("");
      setPrecio("");
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)_120px] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[20px_minmax(0,1fr)_130px_auto]">
      <span />
      <Input autoFocus placeholder="Nombre, por ejemplo PETG negro" value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-8" />
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
        <Input inputMode="decimal" placeholder="el kilo" value={precio} onChange={(e) => setPrecio(e.target.value)} className="h-8 pl-6 text-right font-mono tabular-nums" />
      </div>
      <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
        <Button size="sm" variant="ghost" disabled={!!ocupado} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        <Button size="sm" disabled={!!ocupado || !nombre.trim() || parsePrice(precio) <= 0} onClick={crear}>
          {ocupado === "nuevo" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Agregar
        </Button>
      </div>
    </div>
  );
}

/** Cómo sale una pieza de ejemplo con los valores de hoy y con los que se están escribiendo. */
function Ejemplo({ hoy, nuevo, materiales }: { hoy: ParametrosCosto; nuevo: ParametrosCosto; materiales: MaterialDeFabricacion[] }) {
  const activos = materiales.filter((m) => m.activo);
  const [gramos, setGramos] = useState("100");
  const [horas, setHoras] = useState("4");
  const [material, setMaterial] = useState(() => activos.find((m) => m.porDefecto)?.id ?? activos[0]?.id ?? "");
  const kg = activos.find((m) => m.id === material)?.precioKg ?? hoy.precioKg;
  const g = parsePrice(gramos);
  const s = parsePrice(horas) * 3600;
  const a = desgloseDeFabricacion({ ...hoy, precioKg: kg }, g, s);
  const b = desgloseDeFabricacion({ ...nuevo, precioKg: kg }, g, s);
  const cambia = Math.abs(a.total - b.total) >= 1;
  const filas: Array<[string, number, number]> = [
    ["Material", a.material, b.material],
    ["Luz", a.luz, b.luz],
    ["Desgaste", a.desgaste, b.desgaste],
    ["Margen de error", a.margenError, b.margenError],
  ];
  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
        <span className="text-muted-foreground">Una pieza de</span>
        <Input inputMode="decimal" value={gramos} onChange={(e) => setGramos(e.target.value)} className="h-7 w-16 text-right font-mono tabular-nums" aria-label="Gramos" />
        <span className="text-muted-foreground">g y</span>
        <Input inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} className="h-7 w-14 text-right font-mono tabular-nums" aria-label="Horas" />
        <span className="text-muted-foreground">h en</span>
        <select value={material} onChange={(e) => setMaterial(e.target.value)} className="h-7 rounded-md border bg-transparent px-2 text-sm">
          {activos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>
      <dl className="divide-y text-sm">
        {filas.map(([n, x, y]) => (
          <div key={n} className="flex items-center justify-between px-4 py-2">
            <dt className="text-muted-foreground">{n}</dt>
            <dd className="font-mono tabular-nums">
              {Math.abs(x - y) >= 1 && <span className="mr-2 text-muted-foreground line-through decoration-muted-foreground/40">{pesos(x)}</span>}
              {pesos(y)}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between px-4 py-2.5">
          <dt className="font-medium">Cuesta fabricarla</dt>
          <dd className="font-mono text-base font-medium tabular-nums">
            {cambia && <span className="mr-2 text-sm font-normal text-muted-foreground line-through decoration-muted-foreground/40">{pesos(a.total)}</span>}
            {pesos(b.total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function CostosDeFabricacionPanel({ onGuardado }: { onGuardado: () => void }) {
  const [datos, setDatos] = useState<CostosDeFabricacion | null>(null);
  const [v, setV] = useState<Record<CampoDelTaller, string> | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await pedir<CostosDeFabricacion>("/api/costos/fabricacion");
      setDatos(d);
      setV(Object.fromEntries(CAMPOS_DEL_TALLER.map((c) => [c.campo, numeroATexto(d.parametros[c.campo])])) as Record<CampoDelTaller, string>);
    } catch (e) {
      toast.error(`No se pudieron leer los costos: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambios = useMemo(() => {
    const out: Partial<Record<CampoDelTaller, number>> = {};
    if (!datos || !v) return out;
    for (const c of CAMPOS_DEL_TALLER) {
      const n = parsePrice(v[c.campo]);
      if (v[c.campo].trim() !== "" && n !== datos.parametros[c.campo]) out[c.campo] = n;
    }
    return out;
  }, [datos, v]);
  const n = Object.keys(cambios).length;

  const recargar = useCallback(() => {
    cargar();
    onGuardado();
  }, [cargar, onGuardado]);

  async function guardarTaller() {
    setOcupado("taller");
    try {
      avisoDeGuardado(await pedir<Respuesta>("/api/costos/fabricacion", json("PUT", cambios)));
      recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  if (!datos || !v) return <Skeleton className="h-96 rounded-xl" />;
  const nuevo = { ...datos.parametros, ...cambios };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Materiales</h3>
          <p className="text-sm text-muted-foreground">
            Cada pieza usa el suyo; las que no eligieron ninguno ({datos.piezasSinMaterial}) usan el marcado por defecto. Un material no se borra: se desactiva.
          </p>
        </div>
        <ul className="divide-y rounded-xl border">
          {datos.materiales.map((m) => (
            <FilaMaterial key={`${m.id}-${m.nombre}-${m.precioKg}`} m={m} onGuardado={recargar} ocupado={ocupado} setOcupado={setOcupado} />
          ))}
          <li>
            <MaterialNuevo onGuardado={recargar} ocupado={ocupado} setOcupado={setOcupado} />
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Taller</h3>
          <p className="text-sm text-muted-foreground">Lo que se suma a cada hora de impresión, igual para todas las piezas.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS_DEL_TALLER.map((c) => (
            <label key={c.campo} className="space-y-1">
              <span className="text-sm">
                {c.etiqueta} <span className="text-xs text-muted-foreground">({c.unidad})</span>
              </span>
              <Input
                inputMode="decimal"
                value={v[c.campo]}
                onChange={(e) => setV((p) => (p ? { ...p, [c.campo]: e.target.value } : p))}
                className={`font-mono tabular-nums ${c.campo in cambios ? "border-primary" : ""}`}
              />
              <span className="block text-xs text-muted-foreground">{c.ayuda}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Cómo queda</h3>
        <Ejemplo key={datos.materiales.map((m) => `${m.id}${m.precioKg}${m.activo}`).join()} hoy={datos.parametros} nuevo={nuevo} materiales={datos.materiales} />
      </section>

      <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-3 backdrop-blur">
        <span className="mr-auto text-sm text-muted-foreground">
          {n ? `${n} ${n === 1 ? "cambio" : "cambios"} del taller sin guardar` : "Sin cambios en el taller"}
          {datos.actualizadoEn && ` · último cambio el ${new Date(datos.actualizadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`}
        </span>
        <Button variant="outline" size="sm" disabled={!n || !!ocupado} onClick={cargar}>
          Descartar
        </Button>
        <Button size="sm" disabled={!n || !!ocupado} onClick={guardarTaller}>
          {ocupado === "taller" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
        </Button>
      </div>
    </div>
  );
}
