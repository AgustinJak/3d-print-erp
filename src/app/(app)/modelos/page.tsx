"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, ChevronDown, Download, Loader2, Plus, Search, Zap, Clock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EtiquetaDeCuenta, SelectorDeCuenta, useCuentaActiva } from "@/components/cuenta-activa";
import { EmptyState } from "@/components/empty-state";
import { PiezasNuevas } from "@/components/producto/piezas-nuevas";
import { CrearMlMasivo } from "@/components/producto/crear-ml-masivo";
import { ConfirmarFlex } from "@/components/precios/confirmar-flex";
import { CopiarAOtraCuenta } from "@/components/productos/copiar-ml";
import { FiltrosDeProductos, filtrosPuestos, type Vista } from "@/components/productos/filtros";
import { TablaDeProductos, TarjetasDeProductos } from "@/components/productos/tabla";
import {
  agrupar as agruparFilas,
  alternar,
  estadoDeTilde,
  filtrar,
  filtraVariantes,
  FILTROS_INICIALES,
  ordenar,
  resumir,
  type Agrupar,
  type CanalesDeModelo,
  type CategoriaLista,
  type Filtros,
  type Orden,
  type ProductoLista,
  type RespuestaDeCanales,
  type ResumenDeSeleccion,
} from "@/lib/productos-lista";

/**
 * Productos (docs/sdd/008). Los precios se manejan en Precios: acá se ve dónde está publicado cada
 * producto, su stock y lo que vende, y se hace en cantidad lo de todos los días (crear en ML, la
 * entrega, activar). Lo que se elige es cada variante, y lo elegido se acumula aunque cambien los
 * filtros: así se arma una tanda de a grupos.
 *
 * Con dos cuentas de ML (docs/sdd/011), el selector de arriba dice cuál se mira: los filtros de ML, lo
 * que se ve en cada producto y las publicaciones que toca cada acción son los de esa cuenta.
 */

const PREFERENCIAS = "productos:vista";
const ORDENES: Orden[] = ["nuevo", "antiguo", "az", "za", "vendidos30", "menos_vendidos30", "vendidos", "stock_mas", "stock_menos", "costo_mas", "costo_menos"];

interface Preferencias {
  orden: Orden;
  agrupar: Agrupar;
  vista: Vista;
  verVariantes: boolean;
}

function leerPreferencias(): Partial<Preferencias> {
  try {
    const p = JSON.parse(localStorage.getItem(PREFERENCIAS) ?? "{}") as Partial<Preferencias>;
    return {
      orden: ORDENES.includes(p.orden as Orden) ? p.orden : undefined,
      agrupar: p.agrupar === "serie" || p.agrupar === "categoria" || p.agrupar === "nada" ? p.agrupar : undefined,
      vista: p.vista === "tarjetas" || p.vista === "tabla" ? p.vista : undefined,
      verVariantes: typeof p.verVariantes === "boolean" ? p.verVariantes : undefined,
    };
  } catch {
    return {};
  }
}

const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function ModelosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modelos, setModelos] = useState<ProductoLista[]>([]);
  const [categorias, setCategorias] = useState<CategoriaLista[]>([]);
  const [canales, setCanales] = useState<Record<string, CanalesDeModelo>>({});
  const [leidoEn, setLeidoEn] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [orden, setOrden] = useState<Orden>("nuevo");
  const [agrupar, setAgrupar] = useState<Agrupar>("nada");
  const [vista, setVista] = useState<Vista>("tabla");
  const [verVariantes, setVerVariantes] = useState(false);
  const [mostrarConsolidados, setMostrarConsolidados] = useState(false);
  // "Nuevo producto": sólo el nombre; el resto se completa en su página (docs/sdd/004, spec 001).
  const [nuevo, setNuevo] = useState<{ nombre: string; serie: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const [versionPiezas, setVersionPiezas] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  // Claves de variante (o `m:<id>` para un producto sin variantes activas).
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [masivo, setMasivo] = useState<"crear" | "activar" | "desactivar" | "inmediata" | "a_pedido" | "copiar" | null>(null);
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false);
  // Lo que se manda queda fijo al abrir el diálogo: si no, al refrescar la lista después de aplicar
  // el diálogo volvería a leer ML o perdería sus resultados.
  const [tanda, setTanda] = useState<Pick<ResumenDeSeleccion, "mlas" | "aCrear" | "mlasPrincipal" | "porCuenta">>({ mlas: [], aCrear: [], mlasPrincipal: [], porCuenta: { principal: 0, otra: 0 } });
  // La cuenta de ML que se mira (docs/sdd/011) y la otra cuenta conectada, si hay.
  const { alcance, cuentas, nombre: nombreDeLaCuenta } = useCuentaActiva();

  /* ─── Preferencias de la vista: quedan en el navegador ─── */

  useEffect(() => {
    const p = leerPreferencias();
    // Se leen después del primer dibujo: en el servidor no hay navegador.
    if (p.orden) setOrden(p.orden);
    if (p.agrupar) setAgrupar(p.agrupar);
    if (p.vista) setVista(p.vista);
    if (p.verVariantes != null) setVerVariantes(p.verVariantes);
  }, []);

  const guardar = (cambio: Partial<Preferencias>) => {
    try {
      localStorage.setItem(PREFERENCIAS, JSON.stringify({ orden, agrupar, vista, verVariantes, ...cambio }));
    } catch {
      // Sin almacenamiento (modo privado): la vista funciona igual, sólo no se recuerda.
    }
  };

  /* ─── Datos ───────────────────────────────────────── */

  const fetchModelos = useCallback(async () => {
    const consolidados = mostrarConsolidados ? "incluir" : "ocultar";
    const [res, can] = await Promise.all([fetch(`/api/modelos?consolidados=${consolidados}`), fetch("/api/modelos/canales")]);
    setModelos(await res.json());
    if (can.ok) {
      const r = (await can.json()) as RespuestaDeCanales;
      setCanales(r.modelos ?? {});
      setLeidoEn(r.leidoEn ?? null);
    }
  }, [mostrarConsolidados]);

  const fetchCategorias = useCallback(async () => {
    const res = await fetch("/api/categorias");
    setCategorias(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([fetchModelos(), fetchCategorias()]).then(() => setInitialLoading(false));
  }, [fetchModelos, fetchCategorias]);

  // Enlaces viejos al lápiz: ?edit=<id> va a la página del producto; ?nuevo=1&nombre=Y abre el
  // alta corta (docs/sdd/004, spec 001, REQ-5).
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      router.replace(`/modelos/${editId}`);
      return;
    }
    if (searchParams.get("nuevo") === "1") {
      const nombre = searchParams.get("nombre") || "";
      router.replace("/modelos");
      setTimeout(() => setNuevo({ nombre, serie: "" }), 0);
    }
  }, [searchParams, router]);

  /* ─── Lo que se ve y lo elegido ────────────────────── */

  // "Difieren entre cuentas" sólo tiene sentido mirando las dos.
  const filtrosVigentes = useMemo(() => (alcance === "todas" || !filtros.difieren ? filtros : { ...filtros, difieren: false }), [filtros, alcance]);
  const filas = useMemo(() => ordenar(filtrar(modelos, canales, filtrosVigentes, alcance), orden), [modelos, canales, filtrosVigentes, alcance, orden]);
  const grupos = useMemo(() => agruparFilas(filas, agrupar, orden), [filas, agrupar, orden]);
  const clavesALaVista = useMemo(() => [...new Set(filas.flatMap((f) => f.unidades.map((u) => u.clave)))], [filas]);
  const resumen = useMemo(() => resumir(modelos, canales, elegidos, alcance), [modelos, canales, elegidos, alcance]);
  const sku = useMemo(() => {
    const base = modelos.filter((m) => m.activo && !m.consolidadoEnId && !m.esInsumo);
    return { total: base.length, con: base.filter((m) => m.sku).length };
  }, [modelos]);

  if (initialLoading) return <Cargando />;

  const onAlternar = (claves: string[]) => setElegidos((prev) => alternar(prev, claves));
  const abrirMasivo = (que: NonNullable<typeof masivo>) => {
    setTanda({ mlas: resumen.mlas, aCrear: resumen.aCrear, mlasPrincipal: resumen.mlasPrincipal, porCuenta: resumen.porCuenta });
    setMasivo(que);
  };
  const variantesALaVista = filas.reduce((s, f) => s + f.unidades.filter((u) => u.comb).length, 0);
  const todoElegido = estadoDeTilde(clavesALaVista, elegidos) === "todas";
  const hayConVariantes = filas.some((f) => f.todas.length > 1);

  /* ─── En cantidad ────────────────────────────────── */

  const cambiarActivo = async () => {
    const activo = masivo === "activar";
    setAplicandoMasivo(true);
    let ok = 0;
    for (const id of resumen.productos) {
      const r = await fetch(`/api/modelos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo }) });
      if (r.ok) ok++;
    }
    setAplicandoMasivo(false);
    toast.success(`${ok} ${ok === 1 ? "producto" : "productos"} ${activo ? "activado" : "desactivado"}${ok === 1 ? "" : "s"}`);
    setMasivo(null);
    setElegidos(new Set());
    fetchModelos();
  };

  /* ─── Alta ───────────────────────────────────────── */

  const crearProducto = async () => {
    if (!nuevo?.nombre.trim()) return;
    setCreando(true);
    try {
      const res = await fetch("/api/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevo.nombre.trim(), serie: nuevo.serie.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo crear");
      toast.success("Producto creado");
      router.push(`/modelos/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
      setCreando(false);
    }
  };

  /** Trae ya lo nuevo de Bodega. Si no hay nada, dice de cuándo es lo último que subió. */
  const traerDeBodega = async () => {
    setTrayendo(true);
    try {
      const res = await fetch("/api/bodega/altas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "traer" }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r?.error || "No se pudo traer");
      const traidas: string[] = [...(r.creados ?? []), ...(r.mapeados ?? [])].map((x: { nombre: string }) => x.nombre);
      const omitidas: Array<{ nombre: string; motivo: string }> = r.omitidos ?? [];
      if (traidas.length > 0) toast.success(`${traidas.length === 1 ? "Traída" : `${traidas.length} traídas`}: ${traidas.join(", ")}`);
      for (const o of omitidas) toast.error(`${o.nombre}: ${o.motivo}`);
      const costos: number = r.costosActualizados ?? 0;
      if (costos > 0) toast.success(`Costos actualizados desde Bodega: ${costos} ${costos === 1 ? "producto" : "productos"}`);
      if (traidas.length === 0 && omitidas.length === 0 && costos === 0) {
        const fecha = r.ultimaSubida ? new Date(r.ultimaSubida).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" }) : "nunca";
        toast.info(
          `No hay piezas nuevas. Lo último que subió Bodega es del ${fecha}. Si creaste una después, abrí Bodega › Configuración y fijate que la sincronización tenga la sesión iniciada.`,
          { duration: 12000 }
        );
      }
      setVersionPiezas((v) => v + 1);
      await fetchModelos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo traer");
    } finally {
      setTrayendo(false);
    }
  };

  /* ─── Render ──────────────────────────────────────── */

  return (
    <motion.div className="space-y-4" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      <div className="flex items-end justify-between gap-x-4 gap-y-3 flex-wrap">
        <div className="space-y-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
            <p className="text-sm text-muted-foreground">Dónde está publicado cada uno, su stock y lo que vende.</p>
          </div>
          <SelectorDeCuenta />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={traerDeBodega} disabled={trayendo} title="Trae ya las piezas nuevas que Bodega haya subido">
            {trayendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Traer de Bodega
          </Button>
          <Button onClick={() => setNuevo({ nombre: "", serie: "" })}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      <FiltrosDeProductos
        f={filtrosVigentes}
        alcance={alcance}
        otraCuenta={cuentas.otra}
        onFiltros={(cambio) => setFiltros((prev) => ({ ...prev, ...cambio }))}
        categorias={categorias}
        orden={orden}
        onOrden={(o) => {
          setOrden(o);
          guardar({ orden: o });
        }}
        agrupar={agrupar}
        onAgrupar={(a) => {
          setAgrupar(a);
          guardar({ agrupar: a });
        }}
        vista={vista}
        onVista={(v) => {
          setVista(v);
          guardar({ vista: v });
        }}
        consolidados={mostrarConsolidados}
        onConsolidados={setMostrarConsolidados}
        sku={sku}
      />

      {/* Piezas de Bodega que no entraron solas (docs/sdd/004, spec 005) */}
      <PiezasNuevas key={versionPiezas} onCambio={fetchModelos} />

      {/* Qué se ve, y elegirlo todo de una */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {cuantos(filas.length, "producto", "productos")}
          {variantesALaVista > filas.length && ` · ${variantesALaVista} variantes`}
          {filtraVariantes(filtrosVigentes) && " que pasan los filtros"}
        </span>
        {filas.length > 0 && (
          <button type="button" className="text-primary hover:underline" onClick={() => onAlternar(clavesALaVista)}>
            {todoElegido ? "Quitar de lo elegido todo lo que se ve" : filtrosPuestos(filtrosVigentes) > 0 ? "Elegir todo lo que pasa los filtros" : "Elegir todo"}
          </button>
        )}
        {hayConVariantes && vista === "tabla" && (
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              setVerVariantes(!verVariantes);
              guardar({ verVariantes: !verVariantes });
            }}
          >
            {verVariantes ? "Cerrar las variantes" : "Abrir todas las variantes"}
          </button>
        )}
        {leidoEn && (
          <span className="ml-auto">
            Mercado Libre según la lectura del {new Date(leidoEn).toLocaleString("es-AR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })} ·{" "}
            <Link href="/precios" className="text-primary hover:underline">
              leer de nuevo en Precios
            </Link>
          </span>
        )}
      </div>

      {/* La lista */}
      {filas.length === 0 ? (
        modelos.length === 0 ? (
          <EmptyState icon={Box} title="Sin productos registrados" description="Creá la pieza en Bodega y aparece acá sola, o creá el producto a mano." actionLabel="Nuevo producto" onAction={() => setNuevo({ nombre: "", serie: "" })} />
        ) : (
          <EmptyState icon={Search} title="Sin resultados" description="Ningún producto pasa esos filtros." actionLabel="Sacar filtros" onAction={() => setFiltros({ ...FILTROS_INICIALES, estado: filtros.estado })} />
        )
      ) : vista === "tarjetas" ? (
        <TarjetasDeProductos grupos={grupos} agrupado={agrupar !== "nada"} elegidos={elegidos} onAlternar={onAlternar} onAbrir={(id) => router.push(`/modelos/${id}`)} alcance={alcance} />
      ) : (
        <>
          <div className="hidden md:block">
            <TablaDeProductos
              grupos={grupos}
              agrupado={agrupar !== "nada"}
              elegidos={elegidos}
              onAlternar={onAlternar}
              orden={orden}
              onOrden={(o) => {
                setOrden(o);
                guardar({ orden: o });
              }}
              verVariantes={verVariantes}
              onAbrir={(id) => router.push(`/modelos/${id}`)}
              alcance={alcance}
            />
          </div>
          {/* En el teléfono la tabla no entra: tarjetas. */}
          <div className="md:hidden">
            <TarjetasDeProductos grupos={grupos} agrupado={agrupar !== "nada"} elegidos={elegidos} onAlternar={onAlternar} onAbrir={(id) => router.push(`/modelos/${id}`)} alcance={alcance} />
          </div>
        </>
      )}

      {/* Lo que se hace en cantidad, con lo elegido: flota abajo mientras haya algo elegido */}
      <AnimatePresence>
        {resumen.unidades > 0 && (
          <motion.div
            key="acciones"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-background/90 p-2.5 pl-4 shadow-xl shadow-primary/10 backdrop-blur-md"
          >
            <div className="mr-1">
              <p className="text-sm font-medium leading-tight">
                {resumen.productosAMedias === 0 && resumen.unidades === resumen.productos.length
                  ? cuantos(resumen.productos.length, "producto elegido", "productos elegidos")
                  : `${cuantos(resumen.unidades, "variante elegida", "variantes elegidas")} de ${cuantos(resumen.productos.length, "producto", "productos")}`}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {cuentas.otra && <AQueCuentas porCuenta={resumen.porCuenta} />}
                {resumen.conStock.length > 0 && resumen.sinStock.length > 0 && (
                  <span>
                    <button type="button" className="hover:text-primary hover:underline" title="Dejar elegidas sólo las que tienen stock" onClick={() => setElegidos(new Set(resumen.conStock))}>
                      {resumen.conStock.length} con stock
                    </button>
                    {" · "}
                    <button type="button" className="hover:text-primary hover:underline" title="Dejar elegidas sólo las que no tienen stock" onClick={() => setElegidos(new Set(resumen.sinStock))}>
                      {resumen.sinStock.length} sin stock
                    </button>
                  </span>
                )}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => abrirMasivo("inmediata")} disabled={!resumen.mlas.length} title={`En ML (${nombreDeLaCuenta}): sin tiempo de disponibilidad y con Flex`}>
              <Zap className="h-3.5 w-3.5" /> Con stock: Flex ({resumen.mlas.length})
            </Button>
            <Button size="sm" variant="outline" onClick={() => abrirMasivo("a_pedido")} disabled={!resumen.mlas.length} title={`En ML (${nombreDeLaCuenta}): sin Flex y con días de disponibilidad. Con 0 días queda sin Flex y con entrega inmediata.`}>
              <Clock className="h-3.5 w-3.5" /> Sin stock: a pedido ({resumen.mlas.length})
            </Button>
            {alcance !== "otra" && (
              <Button size="sm" variant="outline" onClick={() => abrirMasivo("crear")} disabled={!resumen.aCrear.length} title={!resumen.aCrear.length ? `Todo lo elegido ya está publicado en ${cuentas.principal}` : `Crear en ${cuentas.principal}`}>
                Crear en ML ({resumen.aCrear.length})
              </Button>
            )}
            {cuentas.otra && alcance !== "principal" && (
              <Button size="sm" variant="outline" onClick={() => abrirMasivo("copiar")} disabled={!resumen.mlasPrincipal.length} title={!resumen.mlasPrincipal.length ? `Todo lo elegido ya está copiado en ${cuentas.otra}` : `Copiar las publicaciones de ${cuentas.principal} a ${cuentas.otra}`}>
                Copiar a {cuentas.otra} ({resumen.mlasPrincipal.length})
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
                Más <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => abrirMasivo("activar")}>Activar {cuantos(resumen.productos.length, "producto", "productos")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => abrirMasivo("desactivar")}>Desactivar {cuantos(resumen.productos.length, "producto", "productos")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" onClick={() => setElegidos(new Set())}>
              Limpiar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── En cantidad ────────────────────────────── */}
      <Dialog open={masivo === "crear"} onOpenChange={(o) => !o && setMasivo(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear en Mercado Libre{cuentas.otra ? `, en ${cuentas.principal}` : ""} ({tanda.aCrear.length})</DialogTitle>
            <DialogDescription>Las variantes elegidas que no están publicadas. No se crea nada hasta que confirmes; quedan pausadas.</DialogDescription>
          </DialogHeader>
          {masivo === "crear" && (
            <CrearMlMasivo
              items={tanda.aCrear}
              onCerrar={() => setMasivo(null)}
              onHecho={() => {
                setElegidos(new Set());
                fetchModelos();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={masivo === "copiar"} onOpenChange={(o) => !o && setMasivo(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Copiar a {cuentas.otra ?? "otra cuenta"}: {cuantos(tanda.mlasPrincipal.length, "publicación", "publicaciones")}
            </DialogTitle>
            <DialogDescription>Mismas fotos, descripción, precio y stock; el título cambia en su última parte. No se crea nada hasta que confirmes, y quedan pausadas.</DialogDescription>
          </DialogHeader>
          {masivo === "copiar" && <CopiarAOtraCuenta mlas={tanda.mlasPrincipal} onCerrar={() => setMasivo(null)} onHecho={fetchModelos} />}
        </DialogContent>
      </Dialog>

      <Dialog open={masivo === "inmediata" || masivo === "a_pedido"} onOpenChange={(o) => !o && setMasivo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {masivo === "inmediata" ? "Entrega inmediata con Flex" : "A pedido, sin Flex"}: {cuantos(tanda.mlas.length, "publicación", "publicaciones")}
            </DialogTitle>
            <DialogDescription>Las publicaciones de ML de las variantes elegidas, como están hoy. No se manda nada hasta que confirmes.</DialogDescription>
            {cuentas.otra && (
              <p className="flex flex-wrap items-center gap-x-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                <AQueCuentas porCuenta={tanda.porCuenta} />
              </p>
            )}
          </DialogHeader>
          {(masivo === "inmediata" || masivo === "a_pedido") && <ConfirmarFlex mlas={tanda.mlas} inmediata={masivo === "inmediata"} onCerrar={() => setMasivo(null)} onHecho={fetchModelos} />}
        </DialogContent>
      </Dialog>

      <Dialog open={masivo === "activar" || masivo === "desactivar"} onOpenChange={(o) => !o && !aplicandoMasivo && setMasivo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {masivo === "activar" ? "Activar" : "Desactivar"} {cuantos(resumen.productos.length, "producto", "productos")}
            </DialogTitle>
            <DialogDescription>
              {masivo === "desactivar"
                ? "Un producto inactivo no aparece para vender en el ERP ni en Precios. No toca sus publicaciones de ML ni de la web."
                : "Vuelven a aparecer para vender en el ERP y en Precios."}
              {resumen.productosAMedias > 0 &&
                ` Ojo: de ${cuantos(resumen.productosAMedias, "producto elegiste", "productos elegiste")} sólo algunas variantes, y esto cambia el producto entero.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMasivo(null)} disabled={aplicandoMasivo}>
              Cancelar
            </Button>
            <Button onClick={cambiarActivo} disabled={aplicandoMasivo}>
              {aplicandoMasivo ? "Guardando…" : masivo === "activar" ? "Activar" : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Nuevo producto ─────────────────────────── */}
      <Dialog open={!!nuevo} onOpenChange={(o) => !o && setNuevo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              crearProducto();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="np-nombre">Nombre</Label>
              <Input id="np-nombre" autoFocus value={nuevo?.nombre ?? ""} onChange={(e) => setNuevo((n) => (n ? { ...n, nombre: e.target.value } : n))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-serie">
                Serie <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input id="np-serie" value={nuevo?.serie ?? ""} placeholder="Demon Slayer, One Piece…" onChange={(e) => setNuevo((n) => (n ? { ...n, serie: e.target.value } : n))} />
            </div>
            <p className="text-xs text-muted-foreground">Lo demás (precio, fotos, variantes, pieza de Bodega) se completa en su página. Si la pieza ya está en Bodega, no hace falta: el producto aparece solo.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creando || !nuevo?.nombre.trim()}>
                {creando ? "Creando…" : "Crear y abrir"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/** A qué cuentas les llega un cambio: cuántas publicaciones de cada una. */
function AQueCuentas({ porCuenta }: { porCuenta: ResumenDeSeleccion["porCuenta"] }) {
  if (!porCuenta.principal && !porCuenta.otra) return <span>Sin publicaciones de ML en lo elegido</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      Se aplica a
      {porCuenta.principal > 0 && (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <EtiquetaDeCuenta de="principal" /> · {porCuenta.principal}
        </span>
      )}
      {porCuenta.otra > 0 && (
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <EtiquetaDeCuenta de="otra" /> · {porCuenta.otra}
        </span>
      )}
    </span>
  );
}

/** La forma de la página mientras carga, para que no salte al llegar los datos. */
function Cargando() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="flex gap-2">
        {[28, 36, 24, 20, 24].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="rounded-xl border bg-card">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/5" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
