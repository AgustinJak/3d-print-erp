"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Box, Check, Layers, Library, Loader2, Plus, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { subirModelo } from "@/components/archivos/subir";
import { ElegirDeLaBiblioteca } from "@/components/producto/archivo-de-pieza";
import { leer3mf } from "@/lib/leer-3mf";
import { cotizar } from "@/lib/cotizador";
import { validarAlta, type EntradaAlta, type ModeloDeAlta } from "@/lib/alta-producto-reglas";
import { tamanoLegible } from "@/lib/tareas-reglas";
import { parsePrice } from "@/lib/utils";
import type { ParametrosCosto } from "@/lib/costos-formula";
import type { GastosVenta, Redondeo } from "@/lib/precios-formula";
import type { Insumo } from "@/lib/recetas";

/**
 * Alta de un producto en el ERP (docs/sdd/014, spec 002): el modelo, sus datos, sus variantes con
 * el modelo de cada una y la funda, y al costado el modelo, el costo y los precios mientras se
 * carga. Al confirmar se crean el producto, las piezas de Bodega, las filas de stock y las
 * combinaciones de una vez (`POST /api/productos/alta`).
 *
 * Los archivos se suben a la biblioteca apenas se eligen; el alta manda sólo sus ids.
 */

/* ─────────────────────────────── tipos y ayudas ─────────────────────────────── */

interface Datos {
  parametros: ParametrosCosto;
  materiales: Array<{ id: string; nombre: string; precioKg: number | null; porDefecto: boolean }>;
  gastos: GastosVenta;
  redondeo: Redondeo;
}

interface PlacaLocal {
  n: number;
  nombre: string;
  miniatura: string | null;
  gramos: number | null;
  segundos: number | null;
}

/** Un archivo elegido: se lee en el navegador y se sube a la biblioteca en el acto. */
interface ArchivoLocal {
  nombre: string;
  tamano: number;
  estado: "subiendo" | "listo" | "error";
  id: string | null;
  miniatura: string | null;
  placas: PlacaLocal[];
  gramos: number | null;
  segundos: number | null;
}

type ModeloDeOpcion = { tipo: "producto" } | { tipo: "placa"; n: number } | { tipo: "propio"; clave: string } | { tipo: "ninguno" };

interface Opcion {
  clave: string;
  nombre: string;
  modelo: ModeloDeOpcion;
  gramos: string;
  minutos: string;
}

const CARPETA = "Modelos";
const ACEPTA = ".3mf,.stl,.obj";
const GRUPOS_SUGERIDOS = ["Color", "Diseño", "Personaje"];
const selectClase =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const num = (s: string) => (s.trim() ? parsePrice(s) : 0);
const numONulo = (s: string) => (s.trim() ? parsePrice(s) : null);
const nuevaClave = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));
const nombreDePlaca = (p: { n: number; nombre: string }) => p.nombre || `Placa ${p.n}`;
const duracion = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};
const urlDe = (png: Uint8Array | null) => (png ? URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" })) : null);

function Campo({ label, children, ayuda, className }: { label: string; children: React.ReactNode; ayuda?: string; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
      {ayuda && <span className="block text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  );
}

function Bloque({ titulo, descripcion, accion, children }: { titulo: string; descripcion?: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">{titulo}</h2>
          {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Un interruptor chico para los bloques opcionales. */
function Interruptor({ activo, onCambio, etiqueta }: { activo: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambio(!activo)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activo ? "bg-primary" : "bg-muted-foreground/25"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${activo ? "translate-x-4" : ""}`} />
    </button>
  );
}

/** Miniatura de un archivo o una placa, en un cuadro del tamaño pedido. */
function Miniatura({ src, tamano = 40, alt = "" }: { src: string | null; tamano?: number; alt?: string }) {
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40" style={{ width: tamano, height: tamano }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      ) : (
        <Box className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
      )}
    </span>
  );
}

/** Zona para soltar o elegir un archivo 3D. */
function SoltarArchivo({ onArchivo, compacta, texto }: { onArchivo: (f: File) => void; compacta?: boolean; texto?: string }) {
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onArchivo(f);
      }}
      className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        encima ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:border-foreground/25 hover:text-foreground"
      } ${compacta ? "h-12 px-4" : "h-36 flex-col"}`}
    >
      <Upload className="h-4 w-4" strokeWidth={1.5} />
      <span>{texto ?? "Soltá el 3MF o el STL, o elegilo"}</span>
      <input
        ref={input}
        type="file"
        accept={ACEPTA}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArchivo(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** "o elegí uno de la biblioteca": un archivo que ya está subido (docs/sdd/014). */
function DeLaBiblioteca({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <Library className="h-4 w-4" strokeWidth={1.5} /> Elegir uno que ya está en la biblioteca
    </button>
  );
}

/** El estado de un archivo ya elegido: nombre, peso y si terminó de subir. */
function ArchivoElegido({ a, onQuitar }: { a: ArchivoLocal; onQuitar: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2 pr-3">
      <Miniatura src={a.miniatura} tamano={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={a.nombre}>
          {a.nombre}
        </p>
        <p className="text-xs text-muted-foreground">
          {tamanoLegible(a.tamano)}
          {a.placas.length > 1 && <> · {a.placas.length} placas</>}
          {a.gramos != null && <> · laminado: {a.gramos} g{a.segundos != null ? `, ${duracion(a.segundos)}` : ""}</>}
        </p>
      </div>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {a.estado === "subiendo" && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo
          </>
        )}
        {a.estado === "listo" && (
          <>
            <Check className="h-3.5 w-3.5" /> En la biblioteca
          </>
        )}
        {a.estado === "error" && <span className="text-destructive">No se pudo subir</span>}
      </span>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onQuitar} aria-label="Quitar el archivo">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ─────────────────────────────── la pantalla ─────────────────────────────── */

function AltaProducto() {
  const router = useRouter();
  const params = useSearchParams();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [insumos, setInsumos] = useState<Insumo[]>([]);

  // Lo que viene del cotizador ("Crear producto con esto"), si viene.
  const [nombre, setNombre] = useState(() => params.get("nombre") ?? "");
  const [serie, setSerie] = useState("");
  const [fabrica, setFabrica] = useState(true);
  const [material, setMaterial] = useState(() => params.get("material") ?? "");
  const [gramos, setGramos] = useState(() => params.get("gramos") ?? "");
  const [horas, setHoras] = useState(() => {
    const m = Number(params.get("minutos") ?? 0);
    return m >= 60 ? String(Math.floor(m / 60)) : "";
  });
  const [minutos, setMinutos] = useState(() => {
    const m = Number(params.get("minutos") ?? 0);
    return m ? String(Math.round(m % 60)) : "";
  });
  const [insumosPesos, setInsumosPesos] = useState(() => params.get("insumos") ?? "");

  // Los archivos elegidos, por clave local. "producto" es el del producto.
  const [archivos, setArchivos] = useState<Record<string, ArchivoLocal>>({});
  const [conVariantes, setConVariantes] = useState(false);
  const [grupo, setGrupo] = useState("Color");
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [eligiendoPlacas, setEligiendoPlacas] = useState(false);

  const [conFunda, setConFunda] = useState(false);
  const [grupoFunda, setGrupoFunda] = useState("Funda");
  const [modoFunda, setModoFunda] = useState<"existente" | "nueva">("existente");
  const [insumoStockId, setInsumoStockId] = useState("");
  const [fundaNombre, setFundaNombre] = useState("");
  const [fundaGramos, setFundaGramos] = useState("");
  const [fundaMinutos, setFundaMinutos] = useState("");

  const [creando, setCreando] = useState(false);
  // Para qué se está eligiendo un archivo de la biblioteca: "producto", "funda" o la clave de una opción.
  const [eligiendoPara, setEligiendoPara] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cotizador")
      .then((r) => r.json())
      .then((d: Datos) => {
        setDatos(d);
        setMaterial((m) => m || d.materiales.find((x) => x.porDefecto)?.id || d.materiales[0]?.id || "");
      })
      .catch(() => toast.error("No se pudo leer la configuración"));
    fetch("/api/insumos")
      .then((r) => (r.ok ? r.json() : []))
      .then((l: Insumo[]) => setInsumos(Array.isArray(l) ? l : []))
      .catch(() => setInsumos([]));
  }, []);

  /* ─── archivos ─── */

  async function usarArchivo(clave: string, file: File) {
    if (!/\.(3mf|stl|obj)$/i.test(file.name)) return toast.error("Sólo 3MF, STL u OBJ");
    let l = { placas: [] as PlacaLocal[], miniatura: null as string | null, gramos: null as number | null, segundos: null as number | null };
    if (/\.3mf$/i.test(file.name)) {
      const r = leer3mf(new Uint8Array(await file.arrayBuffer()));
      l = { placas: r.placas.map((p) => ({ ...p, miniatura: urlDe(p.miniatura) })), miniatura: urlDe(r.miniatura), gramos: r.gramos, segundos: r.segundos };
    }
    setArchivos((a) => ({ ...a, [clave]: { nombre: file.name, tamano: file.size, estado: "subiendo", id: null, ...l } }));
    // Laminado: los gramos y el tiempo se completan solos si están vacíos.
    if (clave === "producto" && l.gramos != null) {
      setGramos((g) => g || String(l.gramos));
      if (l.segundos != null) {
        setHoras((h) => h || String(Math.floor(l.segundos! / 3600)));
        setMinutos((m) => m || String(Math.round((l.segundos! % 3600) / 60)));
      }
    }
    try {
      const r = await subirModelo(file, CARPETA);
      setArchivos((a) => (a[clave]?.nombre === file.name ? { ...a, [clave]: { ...a[clave], estado: "listo", id: r.id } } : a));
    } catch (e) {
      setArchivos((a) => (a[clave]?.nombre === file.name ? { ...a, [clave]: { ...a[clave], estado: "error" } } : a));
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    }
  }

  /** Un archivo que ya está en la biblioteca: no se sube nada, se traen sus placas y lo laminado. */
  async function usarDeBiblioteca(clave: string, id: string) {
    setEligiendoPara(null);
    try {
      const r = await fetch(`/api/archivos/${id}`);
      if (!r.ok) throw new Error();
      const a = (await r.json()) as { id: string; nombre: string; tamano: number; miniatura: string | null; placas: PlacaLocal[] };
      const laminadas = a.placas.filter((p) => p.gramos != null);
      const gramosLam = laminadas.length ? Math.round(laminadas.reduce((s, p) => s + (p.gramos ?? 0), 0) * 100) / 100 : null;
      const conTiempo = a.placas.filter((p) => p.segundos != null);
      const segundosLam = conTiempo.length ? conTiempo.reduce((s, p) => s + (p.segundos ?? 0), 0) : null;
      setArchivos((x) => ({
        ...x,
        [clave]: { nombre: a.nombre, tamano: a.tamano, estado: "listo", id: a.id, miniatura: a.miniatura ?? a.placas[0]?.miniatura ?? null, placas: a.placas, gramos: gramosLam, segundos: segundosLam },
      }));
      if (clave === "producto" && gramosLam != null) {
        setGramos((g) => g || String(gramosLam));
        if (segundosLam != null) {
          setHoras((h) => h || String(Math.floor(segundosLam / 3600)));
          setMinutos((m) => m || String(Math.round((segundosLam % 3600) / 60)));
        }
      }
    } catch {
      toast.error("No se pudo leer ese archivo");
    }
  }

  const quitarArchivo = (clave: string) =>
    setArchivos((a) => {
      const { [clave]: _, ...resto } = a;
      void _;
      return resto;
    });

  const delProducto = archivos.producto ?? null;
  const placasDelProducto = delProducto?.placas ?? [];
  const subiendo = Object.values(archivos).some((a) => a.estado === "subiendo");

  /* ─── variantes ─── */

  const agregarOpcion = (nombreOpcion = "", modelo: ModeloDeOpcion = { tipo: delProducto ? "producto" : "ninguno" }) =>
    setOpciones((o) => [...o, { clave: nuevaClave(), nombre: nombreOpcion, modelo, gramos: "", minutos: "" }]);

  const cambiarOpcion = (clave: string, c: Partial<Opcion>) => setOpciones((o) => o.map((x) => (x.clave === clave ? { ...x, ...c } : x)));

  function miniaturaDeOpcion(o: Opcion): string | null {
    if (o.modelo.tipo === "producto") return delProducto?.miniatura ?? null;
    if (o.modelo.tipo === "placa") {
      const n = o.modelo.n;
      return placasDelProducto.find((p) => p.n === n)?.miniatura ?? null;
    }
    if (o.modelo.tipo === "propio") return archivos[o.modelo.clave]?.miniatura ?? null;
    return null;
  }

  /* ─── lo que se manda ─── */

  const precioKg = datos?.materiales.find((m) => m.id === material)?.precioKg ?? null;
  const segundosProducto = Math.round((num(horas) * 60 + num(minutos)) * 60);

  function modeloDe(o: Opcion): ModeloDeAlta | null {
    if (o.modelo.tipo === "producto") return delProducto?.id ? { archivoId: delProducto.id, placa: null } : null;
    if (o.modelo.tipo === "placa") return delProducto?.id ? { archivoId: delProducto.id, placa: o.modelo.n } : null;
    if (o.modelo.tipo === "propio") {
      const a = archivos[o.modelo.clave];
      return a?.id ? { archivoId: a.id, placa: null } : null;
    }
    return null;
  }

  function recetaDe(o: Opcion) {
    // Lo cargado a mano gana; si no, lo laminado de su placa o de su archivo.
    let g = numONulo(o.gramos);
    let s = o.minutos.trim() ? Math.round(num(o.minutos) * 60) : null;
    const lam =
      o.modelo.tipo === "placa"
        ? placasDelProducto.find((p) => p.n === (o.modelo as { n: number }).n)
        : o.modelo.tipo === "propio"
          ? archivos[o.modelo.clave]
          : null;
    if (g == null && lam?.gramos != null) g = lam.gramos;
    if (s == null && lam?.segundos != null) s = lam.segundos;
    return { gramos: g, segundos: s };
  }

  const entrada: EntradaAlta = {
    nombre,
    serie,
    fabrica,
    receta: {
      gramos: numONulo(gramos),
      segundos: segundosProducto || null,
      materialId: material || null,
      insumos: numONulo(insumosPesos),
    },
    modelo: !conVariantes && delProducto?.id ? { archivoId: delProducto.id, placa: null } : null,
    variantes: conVariantes ? { grupo, opciones: opciones.map((o) => ({ nombre: o.nombre, modelo: fabrica ? modeloDe(o) : null, receta: recetaDe(o) })) } : null,
    funda: conFunda
      ? {
          grupo: grupoFunda,
          insumoStockId: modoFunda === "existente" ? insumoStockId || null : null,
          nuevo:
            modoFunda === "nueva"
              ? {
                  nombre: fundaNombre,
                  modelo: archivos.funda?.id ? { archivoId: archivos.funda.id, placa: null } : null,
                  receta: {
                    gramos: numONulo(fundaGramos) ?? archivos.funda?.gramos ?? null,
                    segundos: fundaMinutos.trim() ? Math.round(num(fundaMinutos) * 60) : (archivos.funda?.segundos ?? null),
                    materialId: material || null,
                    insumos: null,
                  },
                }
              : null,
        }
      : null,
  };
  const falta = validarAlta(entrada);

  const cotizacion = useMemo(
    () =>
      datos && fabrica && num(gramos) > 0
        ? cotizar({ gramos: num(gramos), minutos: segundosProducto / 60, precioKg, insumos: num(insumosPesos), margen: null }, datos.parametros, datos.gastos, datos.redondeo)
        : null,
    [datos, fabrica, gramos, segundosProducto, precioKg, insumosPesos]
  );

  async function crear() {
    if (falta || subiendo || creando) return;
    setCreando(true);
    try {
      const r = await fetch("/api/productos/alta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entrada) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "No se pudo crear");
      toast.success(j.piezas ? `Producto creado con ${j.piezas} ${j.piezas === 1 ? "pieza" : "piezas"}` : "Producto creado");
      router.push(`/modelos/${j.modeloId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
      setCreando(false);
    }
  }

  const piezasQueSeCrean = fabrica ? (conVariantes ? opciones.length : 1) + (conFunda && modoFunda === "nueva" ? 1 : 0) : 0;
  const fundaElegida = insumos.find((i) => i.stockId === insumoStockId);

  /* ─── pantalla ─── */

  return (
    <motion.div className="mx-auto max-w-[1200px] space-y-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <div className="space-y-2">
        <Link href="/modelos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Productos
        </Link>
        <h1 className="text-[28px] leading-[1.15] font-medium">Nuevo producto</h1>
        <p className="text-sm text-muted-foreground">El modelo, sus variantes y su funda. Las piezas de Bodega y el stock se crean solos.</p>
      </div>

      {!datos ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[480px] rounded-xl" />
          <Skeleton className="h-[480px] rounded-xl" />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {/* ─── El modelo ─── */}
            <Bloque
              titulo="Modelo"
              descripcion={fabrica ? "Se guarda en la biblioteca apenas lo elegís" : "No se fabrica: kit, repuesto o reventa, sin pieza de Bodega"}
              accion={
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  Se fabrica
                  <Interruptor activo={fabrica} onCambio={setFabrica} etiqueta="Se fabrica" />
                </label>
              }
            >
              {fabrica &&
                (delProducto ? (
                  <ArchivoElegido a={delProducto} onQuitar={() => quitarArchivo("producto")} />
                ) : (
                  <div className="space-y-3">
                    <SoltarArchivo onArchivo={(f) => usarArchivo("producto", f)} />
                    <DeLaBiblioteca onClick={() => setEligiendoPara("producto")} />
                  </div>
                ))}
              {!fabrica && <p className="text-sm text-muted-foreground">Se crea sólo el producto, con su fila de stock. El precio y las fotos se cargan en su página.</p>}
            </Bloque>

            {/* ─── Los datos ─── */}
            <Bloque titulo="Datos">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Nombre" className="sm:col-span-2">
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Porta auricular Nube" autoFocus />
                </Campo>
                <Campo label="Serie (opcional)">
                  <Input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="Demon Slayer, One Piece…" />
                </Campo>
                {fabrica && (
                  <Campo label="Material">
                    <select value={material} onChange={(e) => setMaterial(e.target.value)} className={selectClase}>
                      {datos.materiales.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre} · {money(m.precioKg ?? datos.parametros.precioKg)} el kilo
                        </option>
                      ))}
                    </select>
                  </Campo>
                )}
              </div>
              {fabrica && (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Campo label="Gramos">
                    <Input value={gramos} onChange={(e) => setGramos(e.target.value)} inputMode="decimal" placeholder="0" />
                  </Campo>
                  <Campo label="Horas">
                    <Input value={horas} onChange={(e) => setHoras(e.target.value)} inputMode="decimal" placeholder="0" />
                  </Campo>
                  <Campo label="Minutos">
                    <Input value={minutos} onChange={(e) => setMinutos(e.target.value)} inputMode="decimal" placeholder="0" />
                  </Campo>
                  <Campo label="Insumos c/u">
                    <Input value={insumosPesos} onChange={(e) => setInsumosPesos(e.target.value)} inputMode="decimal" placeholder="$ 0" />
                  </Campo>
                </div>
              )}
            </Bloque>

            {/* ─── Las variantes ─── */}
            <Bloque
              titulo="Variantes"
              descripcion={conVariantes ? "Cada opción tiene su stock y su pieza de Bodega" : "Si se vende en colores, diseños o personajes"}
              accion={
                <Interruptor
                  activo={conVariantes}
                  etiqueta="Tiene variantes"
                  onCambio={(v) => {
                    setConVariantes(v);
                    if (v && opciones.length === 0) agregarOpcion();
                  }}
                />
              }
            >
              {conVariantes && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-2">
                    <Campo label="Se elige por" className="w-48">
                      <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} />
                    </Campo>
                    <div className="flex gap-1 pb-0.5">
                      {GRUPOS_SUGERIDOS.filter((g) => g !== grupo).map((g) => (
                        <button key={g} type="button" onClick={() => setGrupo(g)} className="h-8 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {opciones.map((o, i) => (
                      <div key={o.clave} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 sm:flex-nowrap">
                        {fabrica && <Miniatura src={miniaturaDeOpcion(o)} />}
                        <Input
                          value={o.nombre}
                          onChange={(e) => cambiarOpcion(o.clave, { nombre: e.target.value })}
                          placeholder={i === 0 ? "Blanco" : "Opción"}
                          className="min-w-32 flex-1"
                          aria-label="Nombre de la opción"
                        />
                        {fabrica && (
                          <>
                            <select
                              className={`${selectClase} w-full sm:w-52`}
                              aria-label={`Modelo de ${o.nombre || "la opción"}`}
                              value={o.modelo.tipo === "placa" ? `placa:${o.modelo.n}` : o.modelo.tipo === "propio" ? "propio" : o.modelo.tipo}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v.startsWith("placa:")) cambiarOpcion(o.clave, { modelo: { tipo: "placa", n: Number(v.slice(6)) } });
                                else if (v === "propio") cambiarOpcion(o.clave, { modelo: { tipo: "propio", clave: o.clave } });
                                else cambiarOpcion(o.clave, { modelo: { tipo: v as "producto" | "ninguno" } });
                              }}
                            >
                              {delProducto && <option value="producto">El archivo del producto</option>}
                              {placasDelProducto.length > 1 &&
                                placasDelProducto.map((p) => (
                                  <option key={p.n} value={`placa:${p.n}`}>
                                    {nombreDePlaca(p)}
                                  </option>
                                ))}
                              <option value="propio">{archivos[o.clave] ? archivos[o.clave].nombre : "Su propio archivo"}</option>
                              <option value="ninguno">Sin archivo por ahora</option>
                            </select>
                            <Input
                              value={o.gramos}
                              onChange={(e) => cambiarOpcion(o.clave, { gramos: e.target.value })}
                              inputMode="decimal"
                              placeholder={recetaDe({ ...o, gramos: "" }).gramos?.toString() ?? (gramos || "g")}
                              className="w-20"
                              aria-label="Gramos de la opción"
                              title="Gramos, si son distintos a los del producto"
                            />
                          </>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setOpciones((x) => x.filter((y) => y.clave !== o.clave))} aria-label={`Quitar ${o.nombre || "la opción"}`}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        {fabrica && o.modelo.tipo === "propio" && !archivos[o.clave] && (
                          <div className="w-full space-y-2">
                            <SoltarArchivo compacta texto={`El archivo de ${o.nombre || "esta opción"}`} onArchivo={(f) => usarArchivo(o.clave, f)} />
                            <DeLaBiblioteca onClick={() => setEligiendoPara(o.clave)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => agregarOpcion()}>
                      <Plus className="h-4 w-4" strokeWidth={1.5} /> Agregar opción
                    </Button>
                    {fabrica && placasDelProducto.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setEligiendoPlacas(true)}>
                        <Layers className="h-4 w-4" strokeWidth={1.5} /> Una opción por placa
                      </Button>
                    )}
                  </div>
                  {fabrica && <p className="text-xs text-muted-foreground">Los colores comparten el archivo del producto. Los gramos vacíos usan los del producto o los de su placa, si está laminada.</p>}
                </div>
              )}
            </Bloque>

            {/* ─── La funda ─── */}
            <Bloque
              titulo="Funda u otro insumo"
              descripcion={conFunda ? `Se vende "Con ${grupoFunda || "…"}" y "Sin ${grupoFunda || "…"}"; con, descuenta el insumo` : "Si se vende con o sin funda"}
              accion={<Interruptor activo={conFunda} onCambio={setConFunda} etiqueta="Lleva funda u otro insumo" />}
            >
              {conFunda && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <Campo label="Nombre" className="w-48">
                      <Input value={grupoFunda} onChange={(e) => setGrupoFunda(e.target.value)} />
                    </Campo>
                    <div className="inline-flex rounded-lg border p-0.5" role="tablist" aria-label="Insumo">
                      {(["existente", "nueva"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="tab"
                          aria-selected={modoFunda === m}
                          onClick={() => setModoFunda(m)}
                          className={`h-8 rounded-md px-3 text-sm transition-colors ${modoFunda === m ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          {m === "existente" ? "Una que ya existe" : "Una nueva"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {modoFunda === "existente" ? (
                    <Campo label="Qué descuenta" ayuda={fundaElegida ? `Stock ${fundaElegida.cantidad} · la usan ${fundaElegida.usadoPor.length} ${fundaElegida.usadoPor.length === 1 ? "producto" : "productos"}` : undefined}>
                      <select value={insumoStockId} onChange={(e) => setInsumoStockId(e.target.value)} className={selectClase}>
                        <option value="">Elegí el insumo</option>
                        {insumos.map((i) => (
                          <option key={i.stockId} value={i.stockId}>
                            {i.etiqueta} · usada por {i.usadoPor.length}
                          </option>
                        ))}
                      </select>
                    </Campo>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_96px_96px]">
                        <Campo label="Nombre del insumo">
                          <Input value={fundaNombre} onChange={(e) => setFundaNombre(e.target.value)} placeholder={`Funda ${nombre || "Yamato"} 95cm`} />
                        </Campo>
                        {fabrica && (
                          <>
                            <Campo label="Gramos">
                              <Input value={fundaGramos} onChange={(e) => setFundaGramos(e.target.value)} inputMode="decimal" placeholder={archivos.funda?.gramos?.toString() ?? "0"} />
                            </Campo>
                            <Campo label="Minutos">
                              <Input value={fundaMinutos} onChange={(e) => setFundaMinutos(e.target.value)} inputMode="decimal" placeholder={archivos.funda?.segundos != null ? String(Math.round(archivos.funda.segundos / 60)) : "0"} />
                            </Campo>
                          </>
                        )}
                      </div>
                      {fabrica &&
                        (archivos.funda ? (
                          <ArchivoElegido a={archivos.funda} onQuitar={() => quitarArchivo("funda")} />
                        ) : (
                          <div className="space-y-2">
                            <SoltarArchivo compacta texto="El archivo del insumo (opcional)" onArchivo={(f) => usarArchivo("funda", f)} />
                            <DeLaBiblioteca onClick={() => setEligiendoPara("funda")} />
                          </div>
                        ))}
                      <p className="text-xs text-muted-foreground">Queda en la lista de insumos para usarlo en otros productos.</p>
                    </div>
                  )}
                </div>
              )}
            </Bloque>
          </div>

          {/* ─── Al costado: el modelo, el costo y los precios ─── */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="flex aspect-[4/3] items-center justify-center bg-muted/40">
                {delProducto?.miniatura ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={delProducto.miniatura} alt={delProducto.nombre} className="h-full w-full object-contain p-4" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <Box className="h-8 w-8" strokeWidth={1} />
                    {fabrica ? "Sin modelo todavía" : "No se fabrica"}
                  </div>
                )}
              </div>
              {placasDelProducto.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto border-t p-2">
                  {placasDelProducto.map((p) => (
                    <span key={p.n} title={nombreDePlaca(p)}>
                      <Miniatura src={p.miniatura} tamano={36} alt={nombreDePlaca(p)} />
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1 border-t p-5">
                <p className="truncate text-base font-medium">{nombre.trim() || "Sin nombre"}</p>
                <p className="text-sm text-muted-foreground">
                  {piezasQueSeCrean > 0 ? `${piezasQueSeCrean} ${piezasQueSeCrean === 1 ? "pieza" : "piezas"} de Bodega` : "Sin piezas de Bodega"}
                  {conVariantes && opciones.length > 0 && ` · ${opciones.length} ${grupo.toLowerCase() || "opciones"}`}
                  {conFunda && ` · con o sin ${grupoFunda.toLowerCase() || "insumo"}`}
                </p>
              </div>
            </div>

            {fabrica && (
              <div className="rounded-xl border bg-card p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Costo por unidad</p>
                  <p className="font-mono text-xl font-medium tabular-nums">{cotizacion ? money(cotizacion.costo) : "—"}</p>
                </div>
                {cotizacion ? (
                  <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
                    {cotizacion.canales.map((k) => (
                      <div key={k.canal} className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">{k.nombre}</dt>
                        <dd className="font-mono tabular-nums">
                          {money(k.precio)}
                          <span className="ml-2 text-xs text-muted-foreground">{Math.round(k.margen)} %</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Cargá los gramos para ver el costo y los precios</p>
                )}
                {conVariantes && cotizacion && <p className="mt-3 text-xs text-muted-foreground">Con los gramos del producto; una opción más pesada cuesta más.</p>}
              </div>
            )}

            <div className="space-y-2">
              <Button className="w-full" disabled={!!falta || subiendo || creando} onClick={crear}>
                {creando && <Loader2 className="h-4 w-4 animate-spin" />}
                {creando ? "Creando" : "Crear producto"}
              </Button>
              <p className="min-h-4 text-center text-xs text-muted-foreground">{subiendo ? "Esperando que terminen de subir los archivos" : (falta ?? "")}</p>
            </div>
          </aside>
        </div>
      )}

      {/* ─── Un archivo que ya está en la biblioteca ─── */}
      <ElegirDeLaBiblioteca abierto={!!eligiendoPara} onCerrar={() => setEligiendoPara(null)} onElegir={(id) => eligiendoPara && usarDeBiblioteca(eligiendoPara, id)} />

      {/* ─── Una opción por placa ─── */}
      <ElegirPlacas
        abierto={eligiendoPlacas}
        placas={placasDelProducto}
        yaUsadas={new Set(opciones.flatMap((o) => (o.modelo.tipo === "placa" ? [o.modelo.n] : [])))}
        onCerrar={() => setEligiendoPlacas(false)}
        onElegir={(elegidas) => {
          setEligiendoPlacas(false);
          setOpciones((o) => [
            // Las filas vacías que quedaron se reemplazan.
            ...o.filter((x) => x.nombre.trim() || x.modelo.tipo === "placa"),
            ...elegidas.map((p) => ({ clave: nuevaClave(), nombre: p.nombre, modelo: { tipo: "placa" as const, n: p.n }, gramos: "", minutos: "" })),
          ]);
        }}
      />
    </motion.div>
  );
}

/** La grilla de placas del 3MF: se tildan las que son opciones y se les pone nombre. */
function ElegirPlacas({
  abierto,
  placas,
  yaUsadas,
  onCerrar,
  onElegir,
}: {
  abierto: boolean;
  placas: PlacaLocal[];
  yaUsadas: Set<number>;
  onCerrar: () => void;
  onElegir: (p: Array<{ n: number; nombre: string }>) => void;
}) {
  const [elegidas, setElegidas] = useState<Record<number, string>>({});

  const alternar = (p: PlacaLocal) =>
    setElegidas((e) => {
      if (p.n in e) {
        const { [p.n]: _, ...resto } = e;
        void _;
        return resto;
      }
      return { ...e, [p.n]: p.nombre };
    });

  const lista = Object.entries(elegidas).map(([n, nombre]) => ({ n: Number(n), nombre: nombre.trim() || `Placa ${n}` }));

  return (
    <Dialog
      open={abierto}
      onOpenChange={(o) => {
        if (!o) {
          setElegidas({});
          onCerrar();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Una opción por placa</DialogTitle>
          <DialogDescription>Tildá las placas que son una opción y ponele nombre a cada una. Las partes de una misma pieza no van.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-0.5 sm:grid-cols-4">
          {placas.map((p) => {
            const elegida = p.n in elegidas;
            const usada = yaUsadas.has(p.n);
            return (
              <div key={p.n} className={`space-y-2 rounded-lg border p-2 transition-colors ${elegida ? "border-primary bg-primary/5" : ""} ${usada ? "opacity-50" : ""}`}>
                <button type="button" disabled={usada} onClick={() => alternar(p)} className="relative block w-full overflow-hidden rounded-md bg-muted/40" aria-pressed={elegida} aria-label={nombreDePlaca(p)}>
                  <span className="flex aspect-square items-center justify-center">
                    {p.miniatura ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.miniatura} alt="" className="h-full w-full object-contain p-2" />
                    ) : (
                      <Box className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </span>
                  <span className={`absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded border transition-colors ${elegida ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
                    {elegida && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
                {elegida ? (
                  <Input value={elegidas[p.n]} onChange={(e) => setElegidas((x) => ({ ...x, [p.n]: e.target.value }))} placeholder={`Placa ${p.n}`} className="h-8" aria-label={`Nombre de la placa ${p.n}`} />
                ) : (
                  <p className="truncate px-1 text-xs text-muted-foreground">
                    {usada ? "Ya es una opción" : nombreDePlaca(p)}
                    {p.gramos != null && ` · ${p.gramos} g`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setElegidas({});
              onCerrar();
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={lista.length === 0}
            onClick={() => {
              onElegir(lista);
              setElegidas({});
            }}
          >
            {lista.length ? `Agregar ${lista.length} ${lista.length === 1 ? "opción" : "opciones"}` : "Agregar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function NuevoProductoPage() {
  return (
    <Suspense>
      <AltaProducto />
    </Suspense>
  );
}
