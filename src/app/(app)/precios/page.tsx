"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Search, Tag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { CAMBIO_GRANDE_PCT, conDiferencia, esGrande, PREFIJO_FALTA, textoDeFalta } from "@/lib/precios-reglas";
import type { FilaDeCanal, FilaErp, Propuesta, ResultadoFila } from "@/lib/precios-propuesta";

/**
 * Precios (docs/sdd/003, spec 004): qué precio cambiaría en cada canal, y aplicarlo.
 *
 * El precio se decide en Bodega; acá sólo se ve la diferencia con lo publicado y se aprueba. Nada
 * sale sin el click de confirmación, y lo que cambia más de 30 % pide confirmarlo aparte.
 */

type Pestana = "combinaciones" | "mercadolibre" | "shop" | "erp" | "historial";
type Filtro = "diferencias" | "aplicables" | "falta-costear" | "falta-mapear" | "todas";

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

/** Una fila para aplicar, sea de un canal o del ERP. */
interface Aplicable {
  clave: string;
  nombre: string;
  antes: number | null;
  despues: number;
  pct: number | null;
}

const REDONDEO: Record<string, string> = {
  exacto: "exacto",
  cien: "a $100",
  quinientos: "a $500",
  mil: "a $1.000",
  noventa: "terminado en 90",
};

const pct = (n: number | null) => (n == null ? "" : `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")} %`);

function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}

function filtrar<T extends { motivo: string | null; diferencia: number | null }>(filas: T[], filtro: Filtro): T[] {
  switch (filtro) {
    case "diferencias":
      return filas.filter((f) => conDiferencia(f));
    case "aplicables":
      return filas.filter((f) => !f.motivo && conDiferencia(f));
    case "falta-costear":
      return filas.filter((f) => f.motivo?.startsWith(PREFIJO_FALTA));
    case "falta-mapear":
      return filas.filter((f) => f.motivo === "falta mapear");
    default:
      return filas;
  }
}

function Diferencia({ diferencia, porcentaje }: { diferencia: number | null; porcentaje: number | null }) {
  if (diferencia == null) return <span className="text-muted-foreground">—</span>;
  if (Math.abs(diferencia) <= 1) return <span className="text-muted-foreground">igual</span>;
  const grande = esGrande(porcentaje);
  return (
    <span className={grande ? "text-destructive font-medium" : diferencia > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
      {diferencia > 0 ? "+" : "−"}
      {pesos(Math.abs(diferencia))} <span className="text-xs">{pct(porcentaje)}</span>
    </span>
  );
}

function PantallaPrecios() {
  const router = useRouter();
  const params = useSearchParams();
  const modelo = params.get("modelo");

  const [datos, setDatos] = useState<Propuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("combinaciones");
  const [filtro, setFiltro] = useState<Filtro>("diferencias");
  const [q, setQ] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [leyendo, setLeyendo] = useState(false);
  const [confirmar, setConfirmar] = useState<{ canal: "mercadolibre" | "erp"; filas: Aplicable[] } | null>(null);
  const [grandesOk, setGrandesOk] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultados, setResultados] = useState<Map<string, ResultadoFila>>(new Map());
  const [historial, setHistorial] = useState<Cambio[] | null>(null);

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

  useEffect(() => {
    if (pestana !== "historial") return;
    pedir<Cambio[]>("/api/precios/historial")
      .then(setHistorial)
      .catch((e) => toast.error(`No se pudo leer el historial: ${e instanceof Error ? e.message : e}`));
  }, [pestana]);

  const busca = (...textos: Array<string | null | undefined>) => {
    const t = q.trim().toLowerCase();
    return !t || textos.some((x) => x?.toLowerCase().includes(t));
  };

  const combinaciones = useMemo(
    () => (datos?.combinaciones ?? []).filter((c) => (!modelo || c.modeloId === modelo) && busca(c.nombre, c.sku)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, modelo, q]
  );
  const canal = (c: "mercadolibre" | "shop") =>
    (datos?.canales ?? []).filter((f) => f.canal === c && (!modelo || f.modeloId === modelo) && busca(f.combinacion, f.titulo, f.clave));
  const ml = useMemo(() => canal("mercadolibre"), [datos, modelo, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const shop = useMemo(() => canal("shop"), [datos, modelo, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const erp = useMemo(() => (datos?.erp ?? []).filter((f) => (!modelo || f.modeloId === modelo) && busca(f.modelo)), [datos, modelo, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const nombreModelo = modelo ? (datos?.combinaciones.find((c) => c.modeloId === modelo)?.modelo ?? "este producto") : null;

  function cambiarPestana(p: Pestana) {
    setPestana(p);
    setElegidas(new Set());
  }

  async function leerMl() {
    setLeyendo(true);
    try {
      const r = await pedir<{ leidas: number; errores: Array<{ mla: string; error: string }> }>("/api/precios/leer?canal=mercadolibre", { method: "POST" });
      toast.success(`${r.leidas} publicaciones leídas` + (r.errores.length ? ` · ${r.errores.length} no se pudieron leer` : ""));
      await cargar();
    } catch (e) {
      toast.error(`No se pudo leer ML: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLeyendo(false);
    }
  }

  function pedirConfirmacion(c: "mercadolibre" | "erp", filas: Aplicable[]) {
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
      setElegidas(new Set());
      await cargar();
    } catch (e) {
      toast.error(`No se pudo aplicar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setAplicando(false);
    }
  }

  const alternar = (clave: string) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });

  const aplicableDeCanal = (f: FilaDeCanal): Aplicable => ({ clave: f.clave, nombre: f.combinacion ?? f.clave, antes: f.publicado, despues: f.propuesto!, pct: f.pct });
  const aplicableDeErp = (f: FilaErp): Aplicable => ({ clave: f.modeloId, nombre: f.modelo, antes: f.actual, despues: f.propuesto!, pct: f.pct });

  const cuenta = (filas: Array<{ motivo: string | null; diferencia: number | null }>) => filas.filter((f) => !f.motivo && conDiferencia(f)).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Precios</h1>
          {datos && (
            <p className="text-sm text-muted-foreground">
              {datos.gastos.deBodega ? "Gastos de Bodega" : "Gastos medidos (Bodega todavía no subió los suyos)"} · margen {datos.gastos.margen} % · promo ML{" "}
              {String(datos.gastos.promo).replace(".", ",")} % · redondeo {REDONDEO[datos.gastos.redondeo] ?? datos.gastos.redondeo}. El margen, la promo y el redondeo
              de cada pieza, si los tiene, van en Bodega.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">ML leído {haceCuanto(datos?.leidoMl ?? null)}</span>
          <Button size="sm" variant="outline" onClick={leerMl} disabled={leyendo}>
            {leyendo ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Leer precios de ML
          </Button>
        </div>
      </div>

      {modelo && (
        <Badge variant="secondary" className="gap-1.5 text-sm py-1">
          <Tag className="h-3.5 w-3.5" /> {nombreModelo}
          <button type="button" onClick={() => router.replace("/precios")} aria-label="Ver todos los productos">
            <X className="h-3.5 w-3.5" />
          </button>
        </Badge>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(
            [
              ["combinaciones", `Combinaciones (${combinaciones.length})`],
              ["mercadolibre", `Mercado Libre (${cuenta(ml)})`],
              ["shop", `Web (${shop.length})`],
              ["erp", `ERP (${cuenta(erp)})`],
              ["historial", "Historial"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" onClick={() => cambiarPestana(v)} className={`px-3 py-1.5 ${pestana === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        {(pestana === "mercadolibre" || pestana === "shop" || pestana === "erp") && (
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(
              [
                ["diferencias", "Con diferencias"],
                ["aplicables", "Se pueden aplicar"],
                ["falta-costear", "Falta costear"],
                ...(pestana === "erp" ? [] : ([["falta-mapear", "Falta mapear"]] as const)),
                ["todas", "Todas"],
              ] as Array<readonly [Filtro, string]>
            ).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setFiltro(v)} className={`px-3 py-1.5 ${filtro === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {pestana !== "historial" && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto, SKU o publicación" className="pl-7 h-8" />
          </div>
        )}
      </div>

      {cargando && !datos ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando precios…
        </div>
      ) : pestana === "combinaciones" ? (
        <TablaCombinaciones filas={combinaciones} />
      ) : pestana === "historial" ? (
        <TablaHistorial cambios={historial} />
      ) : pestana === "erp" ? (
        <TablaErp
          filas={filtrar(erp, filtro)}
          elegidas={elegidas}
          resultados={resultados}
          onAlternar={alternar}
          onAplicar={(filas) => pedirConfirmacion("erp", filas.map(aplicableDeErp))}
        />
      ) : (
        <TablaCanal
          canal={pestana}
          filas={filtrar(pestana === "mercadolibre" ? ml : shop, filtro)}
          elegidas={elegidas}
          resultados={resultados}
          onAlternar={alternar}
          onAplicar={(filas) => pedirConfirmacion("mercadolibre", filas.map(aplicableDeCanal))}
        />
      )}

      <Dialog open={!!confirmar} onOpenChange={(o) => !o && !aplicando && setConfirmar(null)}>
        <DialogContent className="max-w-lg">
          {confirmar && (
            <>
              <DialogHeader>
                <DialogTitle>
                  ¿Cambiar {confirmar.filas.length} {confirmar.filas.length === 1 ? "precio" : "precios"} en {confirmar.canal === "erp" ? "el ERP" : "Mercado Libre"}?
                </DialogTitle>
                <DialogDescription>
                  {confirmar.canal === "erp"
                    ? "Cambia el precio de venta de cada producto y lo que suma cada opción, que es lo que propone el pedido a mano."
                    : "Se manda sólo el precio, de a una publicación. Queda todo en el historial."}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-64 overflow-y-auto divide-y text-sm">
                {confirmar.filas.map((f) => (
                  <div key={f.clave} className={`flex justify-between gap-3 py-1.5 ${esGrande(f.pct) ? "text-destructive" : ""}`}>
                    <span className="truncate">{f.nombre}</span>
                    <span className="shrink-0 tabular-nums">
                      {f.antes != null ? pesos(f.antes) : "—"} → {pesos(f.despues)} <span className="text-xs">{pct(f.pct)}</span>
                    </span>
                  </div>
                ))}
              </div>
              {confirmar.filas.some((f) => esGrande(f.pct)) && (
                <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={grandesOk} onChange={(e) => setGrandesOk(e.target.checked)} />
                  <span>
                    <AlertTriangle className="inline h-3.5 w-3.5 mr-1 text-destructive" />
                    {confirmar.filas.filter((f) => esGrande(f.pct)).length === 1
                      ? `Uno cambia más de ${CAMBIO_GRANDE_PCT} %. Confirmo que lo revisé`
                      : `${confirmar.filas.filter((f) => esGrande(f.pct)).length} cambian más de ${CAMBIO_GRANDE_PCT} %. Confirmo que los revisé`}
                    : un costo mal cargado en Bodega publica un precio malo.
                  </span>
                </label>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={aplicando}>
                  Cancelar
                </Button>
                <Button onClick={aplicar} disabled={aplicando || (confirmar.filas.some((f) => esGrande(f.pct)) && !grandesOk)}>
                  {aplicando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Aplicar {confirmar.filas.length}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TablaCombinaciones({ filas }: { filas: Propuesta["combinaciones"] }) {
  const [verFaltan, setVerFaltan] = useState(false);
  const conPrecio = filas.filter((c) => c.precios);
  const faltan = filas.filter((c) => !c.precios);
  const visibles = verFaltan ? faltan : conPrecio;
  if (!filas.length) return <EmptyState icon={Tag} title="Nada para mostrar" description="No hay combinaciones activas con ese filtro." />;
  return (
    <Card className="overflow-x-auto">
      <div className="flex items-center gap-2 p-3 border-b text-sm">
        <button type="button" onClick={() => setVerFaltan(false)} className={!verFaltan ? "font-medium" : "text-muted-foreground hover:underline"}>
          Con precio ({conPrecio.length})
        </button>
        <span className="text-muted-foreground">·</span>
        <button type="button" onClick={() => setVerFaltan(true)} className={verFaltan ? "font-medium" : "text-muted-foreground hover:underline"}>
          Falta costear ({faltan.length})
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="text-left font-medium p-2">Combinación</th>
            {verFaltan ? (
              <th className="text-left font-medium p-2">Qué falta</th>
            ) : (
              <>
                <th className="text-right font-medium p-2">Costo</th>
                <th className="text-right font-medium p-2">ML</th>
                <th className="text-right font-medium p-2">Web</th>
                <th className="text-right font-medium p-2">Personalizados</th>
                <th className="text-right font-medium p-2">Gana</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {visibles.map((c) => (
            <tr key={c.combinacionId} className="border-b last:border-0 align-top">
              <td className="p-2">
                <Link href={`/modelos/${c.modeloId}`} className="hover:underline">
                  {c.nombre}
                </Link>
                {c.politica.propia && <span className="ml-1.5 text-xs text-muted-foreground">(margen {c.politica.margen} % propio)</span>}
              </td>
              {verFaltan ? (
                <td className="p-2 text-muted-foreground">{textoDeFalta(c.falta).replace(`${PREFIJO_FALTA} — `, "")}</td>
              ) : (
                <>
                  <td className="p-2 text-right tabular-nums" title={`Impresión ${pesos(c.costo!.fabricacion)} + insumos ${pesos(c.costo!.insumos)}`}>
                    {pesos(c.costo!.fabricacion + c.costo!.insumos)}
                    {c.costo!.pieza.insumosSinDeclarar && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" aria-label="Bodega no tiene los insumos de la pieza" />}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {pesos(c.precios!.mlPublicado)}
                    {c.precios!.mlPublicado !== c.precios!.ml && <div className="text-xs text-muted-foreground">paga {pesos(c.precios!.ml)}</div>}
                  </td>
                  <td className="p-2 text-right tabular-nums">{pesos(c.precios!.web)}</td>
                  <td className="p-2 text-right tabular-nums">{pesos(c.precios!.personalizado)}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{c.precios!.ganancia != null ? pesos(c.precios!.ganancia) : "—"}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Resultado({ r }: { r: ResultadoFila | undefined }) {
  if (!r) return null;
  const color = r.estado === "aplicado" ? "text-emerald-600 dark:text-emerald-400" : r.estado === "sin_cambios" ? "text-muted-foreground" : "text-destructive";
  const texto = { aplicado: "Aplicado", sin_cambios: "Ya estaba", rechazado: "No se mandó", error: "Error" }[r.estado];
  return (
    <div className={`text-xs ${color}`}>
      {texto}
      {r.mensaje ? `: ${r.mensaje}` : ""}
    </div>
  );
}

function BarraDeSeleccion({ n, onAplicar, onLimpiar }: { n: number; onAplicar: () => void; onLimpiar: () => void }) {
  if (!n) return null;
  return (
    <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/40 text-sm">
      <span>
        {n} {n === 1 ? "elegida" : "elegidas"}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={onLimpiar}>
          Limpiar
        </Button>
        <Button size="sm" onClick={onAplicar}>
          Aplicar {n}
        </Button>
      </div>
    </div>
  );
}

function TablaCanal({
  canal,
  filas,
  elegidas,
  resultados,
  onAlternar,
  onAplicar,
}: {
  canal: "mercadolibre" | "shop";
  filas: FilaDeCanal[];
  elegidas: Set<string>;
  resultados: Map<string, ResultadoFila>;
  onAlternar: (clave: string) => void;
  onAplicar: (filas: FilaDeCanal[]) => void;
}) {
  const aplicables = filas.filter((f) => !f.motivo && conDiferencia(f));
  const elegidasAca = aplicables.filter((f) => elegidas.has(f.clave));
  if (!filas.length) return <EmptyState icon={Tag} title="Nada para mostrar" description="No hay publicaciones con ese filtro." />;
  return (
    <Card className="overflow-x-auto">
      <BarraDeSeleccion n={elegidasAca.length} onAplicar={() => onAplicar(elegidasAca)} onLimpiar={() => elegidasAca.forEach((f) => onAlternar(f.clave))} />
      {canal === "shop" && (
        <p className="p-3 border-b text-xs text-muted-foreground">
          El precio de la web se lee y se aplica con un endpoint que tiene que sumar el Shop (spec 006). Mientras tanto se ve lo propuesto.
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="w-8 p-2">
              {aplicables.length > 0 && (
                <input
                  type="checkbox"
                  aria-label="Elegir todas"
                  checked={elegidasAca.length === aplicables.length}
                  onChange={() => {
                    const todas = elegidasAca.length === aplicables.length;
                    aplicables.forEach((f) => (todas ? elegidas.has(f.clave) : !elegidas.has(f.clave)) && onAlternar(f.clave));
                  }}
                />
              )}
            </th>
            <th className="text-left font-medium p-2">Combinación</th>
            <th className="text-right font-medium p-2">Publicado</th>
            <th className="text-right font-medium p-2">Propuesto</th>
            <th className="text-right font-medium p-2">Diferencia</th>
            <th className="text-left font-medium p-2">Estado</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const puede = !f.motivo && conDiferencia(f);
            return (
              <tr key={f.clave} className="border-b last:border-0 align-top">
                <td className="p-2">{puede && <input type="checkbox" checked={elegidas.has(f.clave)} onChange={() => onAlternar(f.clave)} aria-label="Elegir" />}</td>
                <td className="p-2">
                  {f.modeloId ? (
                    <Link href={`/modelos/${f.modeloId}`} className="hover:underline">
                      {f.combinacion}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">sin mapear</span>
                  )}
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    {f.enlace ? (
                      <a href={f.enlace} target="_blank" rel="noreferrer" className="hover:underline inline-flex items-center gap-0.5">
                        {f.clave.replace(/\|$/, "")} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="truncate max-w-[260px]">{f.titulo ?? f.clave}</span>
                    )}
                    {f.etiquetas.map((e) => (
                      <Badge key={e} variant="outline" className="text-[10px] px-1 py-0 h-4">
                        {e}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {f.publicado != null ? pesos(f.publicado) : <span className="text-muted-foreground">—</span>}
                  {f.paga != null && f.publicado != null && Math.abs(f.paga - f.publicado) > 1 && <div className="text-xs text-muted-foreground">paga {pesos(f.paga)}</div>}
                </td>
                <td className="p-2 text-right tabular-nums">{f.propuesto != null ? pesos(f.propuesto) : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-2 text-right tabular-nums">
                  <Diferencia diferencia={f.diferencia} porcentaje={f.pct} />
                </td>
                <td className="p-2 text-xs text-muted-foreground max-w-[280px]">
                  {f.motivo ?? (conDiferencia(f) ? "se puede aplicar" : "al día")}
                  <Resultado r={resultados.get(f.clave)} />
                </td>
                <td className="p-2 text-right">
                  {puede && (
                    <Button size="sm" variant={esGrande(f.pct) ? "destructive" : "outline"} onClick={() => onAplicar([f])}>
                      Aplicar
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function TablaErp({
  filas,
  elegidas,
  resultados,
  onAlternar,
  onAplicar,
}: {
  filas: FilaErp[];
  elegidas: Set<string>;
  resultados: Map<string, ResultadoFila>;
  onAlternar: (clave: string) => void;
  onAplicar: (filas: FilaErp[]) => void;
}) {
  const conCambio = (f: FilaErp) => conDiferencia(f) || f.adicionales.some((a) => Math.abs(a.propuesto - a.actual) > 1);
  const aplicables = filas.filter((f) => !f.motivo && conCambio(f));
  const elegidasAca = aplicables.filter((f) => elegidas.has(f.modeloId));
  if (!filas.length) return <EmptyState icon={Tag} title="Nada para mostrar" description="No hay productos con ese filtro." />;
  return (
    <Card className="overflow-x-auto">
      <BarraDeSeleccion n={elegidasAca.length} onAplicar={() => onAplicar(elegidasAca)} onLimpiar={() => elegidasAca.forEach((f) => onAlternar(f.modeloId))} />
      <p className="p-3 border-b text-xs text-muted-foreground">
        El precio de venta del ERP es el de personalizados de la combinación más barata; cada opción suma la diferencia con esa (el pedido a mano suma lo mismo que da la
        combinación).
      </p>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="w-8 p-2" />
            <th className="text-left font-medium p-2">Producto</th>
            <th className="text-right font-medium p-2">Hoy</th>
            <th className="text-right font-medium p-2">Propuesto</th>
            <th className="text-right font-medium p-2">Diferencia</th>
            <th className="text-left font-medium p-2">Opciones</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const puede = !f.motivo && conCambio(f);
            return (
              <tr key={f.modeloId} className="border-b last:border-0 align-top">
                <td className="p-2">{puede && <input type="checkbox" checked={elegidas.has(f.modeloId)} onChange={() => onAlternar(f.modeloId)} aria-label="Elegir" />}</td>
                <td className="p-2">
                  <Link href={`/modelos/${f.modeloId}`} className="hover:underline">
                    {f.modelo}
                  </Link>
                  {f.motivo && <div className="text-xs text-muted-foreground max-w-[340px]">{f.motivo}</div>}
                  <Resultado r={resultados.get(f.modeloId)} />
                </td>
                <td className="p-2 text-right tabular-nums">{pesos(f.actual)}</td>
                <td className="p-2 text-right tabular-nums">{f.propuesto != null ? pesos(f.propuesto) : "—"}</td>
                <td className="p-2 text-right tabular-nums">
                  <Diferencia diferencia={f.diferencia} porcentaje={f.pct} />
                </td>
                <td className="p-2 text-xs text-muted-foreground">
                  {f.adicionales
                    .filter((a) => a.propuesto > 0 || a.actual > 0)
                    .map((a) => (
                      <div key={a.varianteId}>
                        {a.nombre}: +{pesos(a.actual)} → +{pesos(a.propuesto)}
                      </div>
                    ))}
                  {f.desvios > 0 && <div className="text-amber-600">{f.desvios} combinaciones no suman exacto</div>}
                </td>
                <td className="p-2 text-right">
                  {puede && (
                    <Button size="sm" variant={esGrande(f.pct) ? "destructive" : "outline"} onClick={() => onAplicar([f])}>
                      Aplicar
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function TablaHistorial({ cambios }: { cambios: Cambio[] | null }) {
  if (!cambios) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo…
      </div>
    );
  }
  if (!cambios.length) return <EmptyState icon={Tag} title="Todavía no se aplicó ningún precio" description="Cada precio que se aplique desde acá queda anotado." />;
  const CANAL: Record<string, string> = { mercadolibre: "Mercado Libre", shop: "Web", erp: "ERP" };
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="text-left font-medium p-2">Cuándo</th>
            <th className="text-left font-medium p-2">Canal</th>
            <th className="text-left font-medium p-2">Clave</th>
            <th className="text-right font-medium p-2">Antes</th>
            <th className="text-right font-medium p-2">Después</th>
            <th className="text-left font-medium p-2">Estado</th>
            <th className="text-left font-medium p-2">Quién</th>
          </tr>
        </thead>
        <tbody>
          {cambios.map((c) => (
            <tr key={c.id} className="border-b last:border-0 align-top">
              <td className="p-2 whitespace-nowrap">{new Date(c.creadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</td>
              <td className="p-2">{CANAL[c.canal] ?? c.canal}</td>
              <td className="p-2 text-xs font-mono">{c.clave.replace(/\|$/, "")}</td>
              <td className="p-2 text-right tabular-nums">{c.antes != null ? pesos(c.antes) : "—"}</td>
              <td className="p-2 text-right tabular-nums">{pesos(c.despues)}</td>
              <td className="p-2 text-xs">
                {c.estado}
                {c.respuesta?.error && <div className="text-destructive">{c.respuesta.error}</div>}
                {!!c.respuesta?.otrosCambios?.length && <div className="text-destructive">cambiaron: {c.respuesta.otrosCambios.join(", ")}</div>}
                {c.respuesta?.envioGratis && (
                  <div className="text-amber-600">envío gratis: {c.respuesta.envioGratis.antes ? "sí" : "no"} → {c.respuesta.envioGratis.despues ? "sí" : "no"} (lo decide ML)</div>
                )}
                {c.respuesta?.nota && <div className="text-muted-foreground">{c.respuesta.nota}</div>}
              </td>
              <td className="p-2 text-xs text-muted-foreground">{c.usuario ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default function PreciosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando…</div>}>
      <PantallaPrecios />
    </Suspense>
  );
}
