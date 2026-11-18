"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion } from "motion/react";
import { AlertTriangle, ChevronRight, Factory, FileBox, History, Loader2, RefreshCw, Search, Settings2, SlidersHorizontal, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/empty-state";
import { Segmentado } from "@/components/segmentado";
import { EtiquetaDeCuenta, useCuentaActiva } from "@/components/cuenta-activa";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { ConfiguracionDePrecios } from "@/components/precios/configuracion";
import { CostosDeFabricacionPanel } from "@/components/precios/costos-de-fabricacion";
import { MargenMasivo } from "@/components/precios/margen-masivo";
import { ConfirmarFlex } from "@/components/precios/confirmar-flex";
import { EditorAjustes } from "@/components/precios/editor-ajustes";
import { EtiquetaAjuste } from "@/components/precios/etiqueta-ajuste";
import { FichaPrecio } from "@/components/precios/ficha-precio";
import {
  agrupar,
  aplicableDeCanal,
  aplicableDeErp,
  estadoDeCanal,
  haceCuanto,
  hayPendientes,
  pct,
  type Aplicable,
  type Producto,
} from "@/components/precios/por-producto";
import { textoDeFalta, PREFIJO_FALTA } from "@/lib/precios-reglas";
import type { Propuesta, ResultadoFila } from "@/lib/precios-propuesta";

/**
 * Precios (docs/sdd/003, 004 y 015): qué precio cambiaría en cada canal, producto por producto, y
 * aplicarlo.
 *
 * Cada producto es una fila con sus tres canales; la ficha del costado tiene sus publicaciones, sus
 * combinaciones y sus ajustes (un % por canal o un envío propio, con fecha de fin). Nada sale sin el
 * click de confirmación, y lo que cambia más de 30 % pide confirmarlo aparte.
 *
 * Con dos cuentas de ML (docs/sdd/011), el selector de arriba dice qué publicaciones se miran.
 */

type Vista = "cambios" | "ajustes" | "todos" | "ml" | "web" | "erp" | "falta";

interface Cambio {
  id: string;
  canal: string;
  clave: string;
  antes: number | null;
  despues: number;
  estado: string;
  respuesta: { error?: string; otrosCambios?: string[]; envioGratis?: { antes: boolean; despues: boolean } | null; nota?: string } | null;
  usuario: string | null;
  creadoEn: string;
}

const REDONDEO: Record<string, string> = {
  exacto: "sin redondeo",
  cien: "redondeo a $100",
  quinientos: "redondeo a $500",
  mil: "redondeo a $1.000",
  noventa: "terminado en 90",
};

const NOMBRE_DESTINO = { mercadolibre: "Mercado Libre", shop: "la web", erp: "el ERP" } as const;

function PantallaPrecios() {
  const router = useRouter();
  const params = useSearchParams();
  const modelo = params.get("modelo");

  const [datos, setDatos] = useState<Propuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>("cambios");
  const [q, setQ] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState<string | null>(modelo);
  type Panel = "historial" | "configuracion" | "costos";
  const [panel, setPanel] = useState<null | Panel>(() => {
    const p = params.get("panel");
    return p === "historial" || p === "configuracion" || p === "costos" ? p : null;
  });
  const [masivo, setMasivo] = useState<null | "ajuste" | "margen">(null);
  const [leyendo, setLeyendo] = useState<"mercadolibre" | "shop" | null>(null);
  const [confirmar, setConfirmar] = useState<{ canal: "mercadolibre" | "erp" | "shop"; filas: Aplicable[] } | null>(null);
  const [flex, setFlex] = useState<{ prender: boolean; mlas: string[] } | null>(null);
  const [grandesOk, setGrandesOk] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultados, setResultados] = useState<Map<string, ResultadoFila>>(new Map());
  const { alcance, cuentas } = useCuentaActiva();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await pedir<Propuesta>("/api/precios"));
    } catch (e) {
      toast.error(`No se pudo armar la propuesta: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al entrar, ML y la web se leen solos si la última lectura tiene más de una hora (el servidor
  // decide y no deja que corran dos a la vez). Mientras, se ve lo último que había.
  const autoLeida = useRef(false);
  useEffect(() => {
    if (!datos || autoLeida.current) return;
    autoLeida.current = true;
    Promise.resolve().then(async () => {
      for (const canal of ["mercadolibre", "shop"] as const) {
        setLeyendo(canal);
        try {
          const r = await pedir<{ saltada?: string; errores?: unknown[] }>(`/api/precios/leer?canal=${canal}&auto=1`, { method: "POST" });
          if (!r.saltada) {
            await cargar();
            if (r.errores?.length) toast.warning(`${r.errores.length} publicaciones de ${canal === "shop" ? "la web" : "ML"} no se pudieron leer`);
          }
        } catch (e) {
          toast.error(`No se pudo leer ${canal === "shop" ? "la web" : "ML"} sola: ${e instanceof Error ? e.message : e}`);
        } finally {
          setLeyendo(null);
        }
      }
    });
  }, [datos, cargar]);

  const productos = useMemo(() => (datos ? agrupar(datos, alcance) : []), [datos, alcance]);
  const sinProducto = useMemo(() => (datos?.canales ?? []).filter((f) => !f.modeloId && (f.canal === "shop" || alcance === "todas" || f.cuentaMl === alcance)), [datos, alcance]);
  const cuentaDeClave = useMemo(() => new Map((datos?.canales ?? []).filter((f) => f.canal === "mercadolibre").map((f) => [f.clave, f.cuentaMl])), [datos]);
  const cuentaDeMla = useMemo(() => new Map([...cuentaDeClave].map(([k, v]) => [k.split("|")[0], v])), [cuentaDeClave]);

  const totales = useMemo(
    () => ({
      ml: productos.reduce((n, p) => n + p.pendientes.ml.length, 0),
      mlProductos: productos.filter((p) => p.pendientes.ml.length).length,
      web: productos.filter((p) => p.pendientes.web.length).length,
      erp: productos.filter((p) => p.pendientes.erp).length,
      falta: productos.filter((p) => p.faltaCostear).length,
      cambios: productos.filter(hayPendientes).length,
      ajustes: productos.filter((p) => p.ajustes.length).length,
    }),
    [productos]
  );

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    const pasa = (p: Producto) => {
      switch (vista) {
        case "cambios":
          return hayPendientes(p);
        case "ajustes":
          return p.ajustes.length > 0;
        case "ml":
          return p.pendientes.ml.length > 0;
        case "web":
          return p.pendientes.web.length > 0;
        case "erp":
          return !!p.pendientes.erp;
        case "falta":
          return p.faltaCostear;
        default:
          return true;
      }
    };
    const busca = (p: Producto) =>
      !t || p.nombre.toLowerCase().includes(t) || p.combinaciones.some((c) => c.sku?.toLowerCase().includes(t)) || p.ml.some((f) => f.clave.toLowerCase().includes(t));
    const peso = (p: Producto) => p.pendientes.ml.length + p.pendientes.web.length + (p.pendientes.erp ? 1 : 0);
    return productos.filter((p) => pasa(p) && busca(p)).sort((a, b) => peso(b) - peso(a) || Number(a.faltaCostear) - Number(b.faltaCostear) || a.nombre.localeCompare(b.nombre, "es"));
  }, [productos, vista, q]);

  const elegidosP = productos.filter((p) => elegidos.has(p.id));
  const masivoMl = elegidosP.flatMap((p) => p.pendientes.ml);
  const masivoWeb = elegidosP.flatMap((p) => p.pendientes.web);
  const masivoErp = elegidosP.flatMap((p) => (p.pendientes.erp ? [p.pendientes.erp] : []));
  const fichaDe = abierto ? (productos.find((p) => p.id === abierto) ?? null) : null;

  function cerrarFicha() {
    setAbierto(null);
    if (modelo) router.replace("/precios");
  }

  async function leer(canal: "mercadolibre" | "shop") {
    setLeyendo(canal);
    try {
      const r = await pedir<{ leidas: number; productos?: number; errores: unknown[] }>(`/api/precios/leer?canal=${canal}`, { method: "POST" });
      toast.success(
        (canal === "shop" ? `${r.productos} productos de la web leídos` : `${r.leidas} publicaciones leídas`) +
          (r.errores.length ? ` · ${r.errores.length} no se pudieron leer` : "")
      );
      await cargar();
    } catch (e) {
      toast.error(`No se pudo leer ${canal === "shop" ? "la web" : "ML"}: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLeyendo(null);
    }
  }

  function pedirConfirmacion(c: "mercadolibre" | "erp" | "shop", filas: Aplicable[]) {
    if (!filas.length) return;
    setGrandesOk(false);
    setConfirmar({ canal: c, filas });
  }

  async function aplicar() {
    if (!confirmar) return;
    setAplicando(true);
    try {
      const r = await pedir<{ resultados: ResultadoFila[] }>(
        "/api/precios/aplicar",
        json("POST", {
          canal: confirmar.canal,
          filas: confirmar.filas.map((f) => ({ clave: f.clave, precio: f.despues })),
          confirmado: true,
          confirmadoGrandes: grandesOk,
        })
      );
      const n = (e: ResultadoFila["estado"]) => r.resultados.filter((x) => x.estado === e).length;
      const resumen = [`${n("aplicado")} aplicados`, n("sin_cambios") && `${n("sin_cambios")} ya estaban`, n("rechazado") && `${n("rechazado")} no se mandaron`, n("error") && `${n("error")} con error`]
        .filter(Boolean)
        .join(" · ");
      (n("error") || n("rechazado") ? toast.warning : toast.success)(resumen);
      setResultados((prev) => new Map([...prev, ...r.resultados.map((x) => [x.clave, x] as const)]));
      setConfirmar(null);
      await cargar();
    } catch (e) {
      toast.error(`No se pudo aplicar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setAplicando(false);
    }
  }

  const alternar = (id: string) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const todosElegidos = visibles.length > 0 && visibles.every((p) => elegidos.has(p.id));

  const tarjetas: Array<{ v: Vista; titulo: string; n: number; detalle: string }> = [
    { v: "ml", titulo: "Mercado Libre", n: totales.ml, detalle: totales.ml ? `publicaciones en ${totales.mlProductos} productos` : "todo al día" },
    { v: "web", titulo: "Web", n: totales.web, detalle: totales.web ? "productos para actualizar" : "todo al día" },
    { v: "erp", titulo: "Venta directa", n: totales.erp, detalle: totales.erp ? "productos con otro precio en el ERP" : "todo al día" },
    { v: "falta", titulo: "Falta costear", n: totales.falta, detalle: "productos sin precio en alguna combinación" },
  ];

  return (
    <motion.div className="space-y-6 pb-24" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-1.5">
          <h1 className="text-[28px] leading-[1.15] font-medium">Precios</h1>
          {datos && (
            <p className="text-sm text-muted-foreground">
              Margen {datos.gastos.margen} % sobre el precio · promo ML {String(datos.gastos.promo).replace(".", ",")} % · {REDONDEO[datos.gastos.redondeo] ?? datos.gastos.redondeo}.{" "}
              {datos.gastos.origen === "erp" ? "Cada publicación de ML con lo que cobra ML por ella." : datos.gastos.deBodega ? "Gastos de Bodega." : "Gastos medidos."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["mercadolibre", "Leer ML", datos?.leidoMl],
              ["shop", "Leer la web", datos?.leidoShop],
            ] as const
          ).map(([canal, texto, leido]) => (
            <Button key={canal} size="sm" variant="outline" onClick={() => leer(canal)} disabled={!!leyendo} title={`Leído ${haceCuanto(leido ?? null)}`}>
              {leyendo === canal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />}
              {texto}
              <span className="text-xs font-normal text-muted-foreground">{leyendo === canal ? "leyendo…" : haceCuanto(leido ?? null)}</span>
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setPanel("historial")}>
            <History className="h-4 w-4" strokeWidth={1.5} /> Historial
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPanel("costos")}>
            <Factory className="h-4 w-4" strokeWidth={1.5} /> Costos
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPanel("configuracion")}>
            <Settings2 className="h-4 w-4" strokeWidth={1.5} /> Configuración
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((t) => {
          const activa = vista === t.v;
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => setVista(activa ? "cambios" : t.v)}
              aria-pressed={activa}
              className={`rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${activa ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="text-xs text-muted-foreground">{t.titulo}</div>
              <div className={`mt-2 font-mono text-[28px] leading-none font-medium tabular-nums ${t.n === 0 ? "text-muted-foreground/60" : ""}`}>{cargando && !datos ? "·" : t.n}</div>
              <div className="mt-1.5 truncate text-xs text-muted-foreground">{t.detalle}</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          chico
          etiqueta="Qué productos"
          valor={vista}
          onChange={setVista}
          opciones={[
            ["cambios", <>Con cambios <Cuenta n={totales.cambios} /></>],
            ["ajustes", <>Con ajustes <Cuenta n={totales.ajustes} /></>],
            ["todos", <>Todos <Cuenta n={productos.length} /></>],
          ]}
        />
        {!["cambios", "ajustes", "todos"].includes(vista) && (
          <button type="button" onClick={() => setVista("cambios")} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs">
            {tarjetas.find((t) => t.v === vista)?.titulo} <X className="h-3 w-3" />
          </button>
        )}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, SKU o publicación" className="h-8 pl-8" />
        </div>
      </div>

      {cargando && !datos ? (
        <div className="divide-y rounded-xl border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-11 w-11 rounded-lg" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="ml-auto h-4 w-64" />
            </div>
          ))}
        </div>
      ) : !visibles.length ? (
        <EmptyState
          icon={Tag}
          title={vista === "cambios" ? "Todo al día" : "Nada para mostrar"}
          description={vista === "cambios" ? "Ningún precio publicado difiere de lo que calcula el ERP." : "No hay productos con ese filtro."}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden items-center gap-4 border-b px-4 py-2 text-xs text-muted-foreground md:grid md:grid-cols-[20px_minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_16px]">
            <input type="checkbox" className="accent-primary" aria-label="Elegir todos" checked={todosElegidos} onChange={() => setElegidos(todosElegidos ? new Set() : new Set(visibles.map((p) => p.id)))} />
            <span>
              {visibles.length} {visibles.length === 1 ? "producto" : "productos"}
            </span>
            <span className="text-right">Mercado Libre</span>
            <span className="text-right">Web</span>
            <span className="text-right">Venta directa</span>
            <span />
          </div>
          <ul className="divide-y">
            {visibles.map((p) => (
              <FilaProducto key={p.id} p={p} elegido={elegidos.has(p.id)} onElegir={() => alternar(p.id)} onAbrir={() => setAbierto(p.id)} />
            ))}
          </ul>
        </div>
      )}

      {sinProducto.length > 0 && <SinProducto filas={sinProducto} />}

      {elegidos.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-1.5 rounded-xl border bg-popover p-2 shadow-lg"
        >
          <span className="px-2 text-sm">
            <span className="font-mono tabular-nums">{elegidos.size}</span> {elegidos.size === 1 ? "producto" : "productos"}
          </span>
          <Button size="sm" variant="outline" onClick={() => setMasivo("ajuste")}>
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} /> Ajustar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMasivo("margen")}>
            Margen
          </Button>
          {masivoMl.length > 0 && (
            <Button size="sm" onClick={() => pedirConfirmacion("mercadolibre", masivoMl.map(aplicableDeCanal))}>
              Aplicar en ML · {masivoMl.length}
            </Button>
          )}
          {masivoWeb.length > 0 && (
            <Button size="sm" onClick={() => pedirConfirmacion("shop", masivoWeb.map(aplicableDeCanal))}>
              En la web · {new Set(masivoWeb.map((f) => f.producto)).size}
            </Button>
          )}
          {masivoErp.length > 0 && (
            <Button size="sm" onClick={() => pedirConfirmacion("erp", masivoErp.map(aplicableDeErp))}>
              En el ERP · {masivoErp.length}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setElegidos(new Set())} aria-label="Soltar la selección">
            <X className="h-4 w-4" />
          </Button>
        </motion.div>
      )}

      <FichaPrecio
        producto={fichaDe}
        onCerrar={cerrarFicha}
        onAplicar={pedirConfirmacion}
        onFlex={(prender, mlas) => setFlex({ prender, mlas })}
        onRecargar={cargar}
        resultados={resultados}
        opcionesMl={datos?.opcionesMl ?? {}}
      />

      <Dialog open={!!masivo} onOpenChange={(o) => !o && setMasivo(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {masivo === "ajuste" ? "Ajuste" : "Margen"} de {elegidos.size} {elegidos.size === 1 ? "producto" : "productos"}
            </DialogTitle>
            <DialogDescription>Mirá cómo quedan antes de guardar. No se publica nada.</DialogDescription>
          </DialogHeader>
          {masivo === "ajuste" && (
            <EditorAjustes
              modeloIds={[...elegidos]}
              onGuardado={() => {
                setMasivo(null);
                cargar();
              }}
            />
          )}
          {masivo === "margen" && (
            <MargenMasivo
              modeloIds={[...elegidos]}
              onCerrar={() => setMasivo(null)}
              onGuardado={() => {
                setMasivo(null);
                cargar();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Sheet
        open={!!panel}
        onOpenChange={(o) => {
          if (o) return;
          setPanel(null);
          if (params.get("panel")) router.replace("/precios");
        }}
      >
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-[720px]">
          <SheetHeader className="border-b p-6">
            <SheetTitle className="text-xl font-medium">{panel === "historial" ? "Historial" : panel === "costos" ? "Costo de fabricación" : "Configuración"}</SheetTitle>
            <SheetDescription>
              {panel === "historial"
                ? "Cada precio que se aplicó desde acá."
                : panel === "costos"
                  ? "El precio de cada material y lo que cuesta una hora de impresión. Al guardar se recalcula el costo de los productos; no se publica ningún precio."
                  : "Margen, promo, redondeo y gastos de cada canal para todos los productos."}
            </SheetDescription>
          </SheetHeader>
          <div className="p-6">{panel === "historial" ? <Historial /> : panel === "configuracion" ? <ConfiguracionDePrecios onGuardado={cargar} /> : panel === "costos" ? <CostosDeFabricacionPanel onGuardado={cargar} /> : null}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!flex} onOpenChange={(o) => !o && setFlex(null)}>
        <DialogContent className="sm:max-w-lg">
          {flex && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {flex.prender ? "Entrega inmediata con Flex" : "A pedido, sin Flex"}: {flex.mlas.length} {flex.mlas.length === 1 ? "publicación" : "publicaciones"}
                </DialogTitle>
                <DialogDescription>Así están hoy en Mercado Libre. No se manda nada hasta que confirmes.</DialogDescription>
                {cuentas.otra && <AQueCuentas cuentas={flex.mlas.map((m) => cuentaDeMla.get(m) ?? null)} />}
              </DialogHeader>
              <ConfirmarFlex mlas={flex.mlas} inmediata={flex.prender} onCerrar={() => setFlex(null)} onHecho={cargar} />
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmar} onOpenChange={(o) => !o && !aplicando && setConfirmar(null)}>
        <DialogContent className="max-w-lg">
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>
                  ¿Cambiar {confirmar.filas.length} {confirmar.filas.length === 1 ? "precio" : "precios"} en {NOMBRE_DESTINO[confirmar.canal]}?
                </DialogTitle>
                <DialogDescription>
                  {confirmar.canal === "erp"
                    ? "Cambia el precio de venta de cada producto y lo que suma cada opción, que es lo que propone el pedido a mano."
                    : confirmar.canal === "shop"
                      ? "En la web va cada producto entero, con todas sus combinaciones: el Shop decide cómo guardarlo (base, extras y reglas) y escribe todo o nada. Queda todo en el historial."
                      : "Se manda sólo el precio, de a una publicación. Queda todo en el historial."}
                </DialogDescription>
                {confirmar.canal === "mercadolibre" && cuentas.otra && <AQueCuentas cuentas={confirmar.filas.map((f) => cuentaDeClave.get(f.clave) ?? null)} />}
              </DialogHeader>
              <div className="max-h-64 divide-y overflow-y-auto text-sm">
                {confirmar.filas.map((f) => (
                  <div key={f.clave} className={`flex justify-between gap-3 py-1.5 ${f.aparte ? "text-destructive" : ""}`}>
                    <span className="truncate">
                      {f.nombre}
                      {f.aparte && <span className="block text-xs">{f.aparte}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[13px] tabular-nums">
                      {f.antes != null ? pesos(f.antes) : "—"} → {pesos(f.despues)} <span className="text-xs">{pct(f.pct)}</span>
                    </span>
                  </div>
                ))}
              </div>
              {confirmar.filas.some((f) => f.aparte) && (
                <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={grandesOk} onChange={(e) => setGrandesOk(e.target.checked)} />
                  <span>
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-destructive" />
                    {confirmar.filas.filter((f) => f.aparte).length === 1 ? "El marcado en rojo" : `Los ${confirmar.filas.filter((f) => f.aparte).length} marcados en rojo`} cambia
                    {confirmar.filas.filter((f) => f.aparte).length === 1 ? "" : "n"} mucho o le saca la promoción. Confirmo que lo revisé: una receta mal cargada en una pieza publica un precio malo.
                  </span>
                </label>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={aplicando}>
                  Cancelar
                </Button>
                <Button onClick={aplicar} disabled={aplicando || (confirmar.filas.some((f) => f.aparte) && !grandesOk)}>
                  {aplicando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Aplicar {confirmar.filas.length}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function Cuenta({ n }: { n: number }) {
  return <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{n}</span>;
}

/** A cuántas publicaciones de cada cuenta llega un cambio (docs/sdd/011, RN-3). */
function AQueCuentas({ cuentas }: { cuentas: Array<"principal" | "otra" | null> }) {
  const n = (c: "principal" | "otra") => cuentas.filter((x) => x === c).length;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
      Se aplica a
      {(["principal", "otra"] as const).map((c) =>
        n(c) > 0 ? (
          <span key={c} className="inline-flex items-center gap-1 font-medium text-foreground">
            <EtiquetaDeCuenta de={c} /> · {n(c)}
          </span>
        ) : null
      )}
    </p>
  );
}

/** Un canal en la fila del producto: el precio que calcula el ERP y en qué está. */
function Canal({ nombre, precio, antes, estado }: { nombre: string; precio: number | null | undefined; antes?: number | null; estado: { texto: string; tono: "accion" | "quieto" | "aviso" } }) {
  const cambia = antes != null && precio != null && Math.abs(antes - precio) > 1;
  return (
    <div className="min-w-0 text-left md:text-right">
      <div className="text-[11px] text-muted-foreground md:hidden">{nombre}</div>
      <div className="font-mono text-sm tabular-nums whitespace-nowrap">
        {cambia && (
          <>
            <span className="text-muted-foreground line-through decoration-muted-foreground/40">{pesos(antes!)}</span> <span className="text-muted-foreground">→</span>{" "}
          </>
        )}
        {precio != null ? pesos(precio) : <span className="text-muted-foreground">—</span>}
      </div>
      <div
        className={`flex items-center gap-1.5 text-xs md:justify-end ${estado.tono === "accion" ? "text-foreground" : estado.tono === "aviso" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {estado.tono === "accion" && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
        {estado.texto}
      </div>
    </div>
  );
}

/**
 * El precio de hoy y el nuevo de un canal, para la fila: el de la publicación de la combinación base
 * (la de una unidad); si esa está al día pero otra no, el de la primera que cambia.
 */
function hoyYNuevo(filas: Producto["ml"], base: Producto["base"]): { hoy: number | null; nuevo: number | null } | null {
  const cambia = (f: Producto["ml"][number]) => f.publicado != null && f.propuesto != null && Math.abs(f.propuesto - f.publicado) > 1;
  const sueltas = filas.filter((f) => f.unidades === 1 && !f.ignorada);
  const f = sueltas.find((x) => x.combinacionId === base?.combinacionId && cambia(x)) ?? sueltas.find(cambia);
  return f ? { hoy: f.publicado, nuevo: f.propuesto } : null;
}

function FilaProducto({ p, elegido, onElegir, onAbrir }: { p: Producto; elegido: boolean; onElegir: () => void; onAbrir: () => void }) {
  const b = p.base?.precios;
  const erp = p.erp;
  const ml = p.pendientes.ml.length ? hoyYNuevo(p.ml, p.base) : null;
  const web = p.pendientes.web.length ? hoyYNuevo(p.web, p.base) : null;
  const estadoErp = !erp
    ? { texto: "—", tono: "quieto" as const }
    : p.pendientes.erp
      ? { texto: "por actualizar", tono: "accion" as const }
      : erp.motivo?.startsWith(PREFIJO_FALTA)
        ? { texto: "falta costear", tono: "aviso" as const }
        : { texto: "al día", tono: "quieto" as const };
  return (
    <li
      className={`group grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_16px] items-center gap-x-4 gap-y-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[20px_minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_16px] ${elegido ? "bg-primary/[0.04]" : ""}`}
      onClick={onAbrir}
    >
      <input
        type="checkbox"
        className="accent-primary"
        aria-label={`Elegir ${p.nombre}`}
        checked={elegido}
        onClick={(e) => e.stopPropagation()}
        onChange={onElegir}
      />
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
          {p.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.foto} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <FileBox className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="truncate text-sm font-medium">{p.nombre}</div>
          {p.ajustes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {p.ajustes.map((a) => (
                <EtiquetaAjuste key={a.id} a={a} />
              ))}
            </div>
          ) : (
            <div className="truncate text-xs text-muted-foreground">
              {p.faltaCostear && !b
                ? textoDeFalta(p.combinaciones[0]?.falta ?? []).replace(`${PREFIJO_FALTA} — `, "Falta costear: ")
                : `${p.combinaciones.length} ${p.combinaciones.length === 1 ? "combinación" : "combinaciones"}${p.base?.politica.margenPropio ? ` · margen ${p.base.politica.margen} % propio` : ""}`}
            </div>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 md:order-last" />
      <div className="col-span-3 grid grid-cols-3 gap-3 pl-9 md:contents">
        <Canal nombre="Mercado Libre" precio={ml?.nuevo ?? b?.mlPublicado} antes={ml?.hoy} estado={estadoDeCanal(p.ml, p.pendientes.ml.length)} />
        <Canal nombre="Web" precio={web?.nuevo ?? b?.web} antes={web?.hoy} estado={estadoDeCanal(p.web, p.pendientes.web.length ? p.web.filter((f) => f.diferencia != null && Math.abs(f.diferencia) > 1).length || 1 : 0)} />
        <Canal nombre="Venta directa" precio={erp?.propuesto ?? b?.personalizado} antes={p.pendientes.erp ? erp?.actual : null} estado={estadoErp} />
      </div>
    </li>
  );
}

/** Publicaciones que no están unidas a ningún producto del ERP: no tienen precio propuesto. */
function SinProducto({ filas }: { filas: Propuesta["canales"] }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="rounded-xl border border-dashed">
      <button type="button" onClick={() => setAbierto((x) => !x)} className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm">
        <span>
          <span className="font-mono tabular-nums">{filas.length}</span> {filas.length === 1 ? "publicación sin producto" : "publicaciones sin producto"} del ERP
          <span className="block text-xs text-muted-foreground">Sin producto no hay precio para proponer: se unen desde la página del producto.</span>
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${abierto ? "rotate-90" : ""}`} />
      </button>
      {abierto && (
        <ul className="divide-y border-t">
          {filas.map((f) => (
            <li key={`${f.canal}-${f.clave}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="mr-2 text-xs text-muted-foreground">{f.canal === "shop" ? "Web" : "ML"}</span>
                {f.enlace ? (
                  <a href={f.enlace} target="_blank" rel="noreferrer" className="hover:underline">
                    {f.titulo ?? f.clave}
                  </a>
                ) : (
                  (f.titulo ?? f.clave)
                )}
              </span>
              <span className="shrink-0 font-mono text-[13px] tabular-nums">{f.publicado != null ? pesos(f.publicado) : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Historial() {
  const [cambios, setCambios] = useState<Cambio[] | null>(null);
  useEffect(() => {
    pedir<Cambio[]>("/api/precios/historial")
      .then(setCambios)
      .catch((e) => toast.error(`No se pudo leer el historial: ${e instanceof Error ? e.message : e}`));
  }, []);
  if (!cambios) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo…
      </div>
    );
  }
  if (!cambios.length) return <EmptyState icon={Tag} title="Todavía no se aplicó ningún precio" description="Cada precio que se aplique desde acá queda anotado." />;
  const CANAL: Record<string, string> = { mercadolibre: "ML", shop: "Web", erp: "ERP" };
  return (
    <ul className="divide-y rounded-xl border">
      {cambios.map((c) => {
        const mal = c.estado !== "aplicado" && c.estado !== "sin_cambios";
        return (
          <li key={c.id} className="flex gap-3 p-3 text-sm">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${mal ? "bg-destructive" : "bg-muted-foreground/40"}`} aria-hidden />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 text-xs text-muted-foreground">{CANAL[c.canal] ?? c.canal}</span>
                  <span className="font-mono text-xs">{c.clave.replace(/\|$/, "")}</span>
                </span>
                <span className="font-mono text-[13px] tabular-nums">
                  {c.antes != null ? pesos(c.antes) : "—"} <span className="text-muted-foreground">→</span> {pesos(c.despues)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(c.creadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })} · {c.estado}
                {c.usuario && ` · ${c.usuario}`}
              </div>
              {c.respuesta?.error && <div className="text-xs text-destructive">{c.respuesta.error}</div>}
              {!!c.respuesta?.otrosCambios?.length && <div className="text-xs text-destructive">cambiaron: {c.respuesta.otrosCambios.join(", ")}</div>}
              {c.respuesta?.envioGratis && (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  envío gratis: {c.respuesta.envioGratis.antes ? "sí" : "no"} → {c.respuesta.envioGratis.despues ? "sí" : "no"} (lo decide ML)
                </div>
              )}
              {c.respuesta?.nota && <div className="text-xs text-muted-foreground">{c.respuesta.nota}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function PreciosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando…</div>}>
      <PantallaPrecios />
    </Suspense>
  );
}
