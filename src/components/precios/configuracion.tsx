"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { REDONDEOS } from "@/lib/precios-formula";
import type { CambioDeConfig, ConfigDePrecios, DefinicionDeCampo, Ejemplo, ResumenDeTramo } from "@/lib/precios-config";

/**
 * Precios › Configuración (docs/sdd/006, spec 001): los valores generales con que se calcula,
 * qué cambia cada uno en pesos (tres productos de ejemplo y los tramos de la web), y el
 * historial. Guardar no publica nada: los precios nuevos se aplican en las otras pestañas.
 */

interface Datos {
  config: ConfigDePrecios;
  campos: DefinicionDeCampo[];
  ejemplos: Ejemplo[];
  tramos: ResumenDeTramo[];
  historial: CambioDeConfig[];
}

const GRUPOS: DefinicionDeCampo["grupo"][] = ["Margen y promo", "Mercado Libre", "Web", "Impuestos", "Respaldo"];
const valor = (d: DefinicionDeCampo, v: unknown) => (typeof v === "number" ? (d.unidad === "$" ? pesos(v) : `${String(v).replace(".", ",")} %`) : String(v ?? "—"));

function Ejemplos({ antes, despues }: { antes: Ejemplo[]; despues: Ejemplo[] | null }) {
  const nuevo = new Map((despues ?? []).map((e) => [e.combinacionId, e]));
  const celda = (a: number | null, b: number | null | undefined) =>
    b == null || a === b ? (
      <span className="tabular-nums">{a == null ? "—" : pesos(a)}</span>
    ) : (
      <span className="tabular-nums">
        <span className="text-muted-foreground line-through mr-1">{a == null ? "—" : pesos(a)}</span>
        <span className="font-medium">{pesos(b)}</span>
      </span>
    );
  return (
    <div className="rounded-lg border divide-y text-sm overflow-x-auto">
      <div className="grid grid-cols-[minmax(140px,2fr)_repeat(4,minmax(90px,1fr))] gap-3 px-3 py-2 text-xs text-muted-foreground min-w-[560px]">
        <span>Producto (costo)</span>
        <span>ML publicado</span>
        <span>Deja en ML</span>
        <span>Web</span>
        <span>Personalizado</span>
      </div>
      {antes.map((e) => {
        const n = nuevo.get(e.combinacionId);
        return (
          <div key={e.combinacionId} className="grid grid-cols-[minmax(140px,2fr)_repeat(4,minmax(90px,1fr))] gap-3 px-3 py-2 min-w-[560px]">
            <span className="truncate">
              {e.producto} <span className="text-muted-foreground">({pesos(e.costo)})</span>
            </span>
            {celda(e.mlPublicado, n?.mlPublicado)}
            {celda(e.ganancia, n?.ganancia)}
            {celda(e.web, n?.web)}
            {celda(e.personalizado, n?.personalizado)}
          </div>
        );
      })}
    </div>
  );
}

function Tramos({ tramos }: { tramos: ResumenDeTramo[] }) {
  return (
    <div className="rounded-lg border divide-y text-sm">
      {tramos.map((t) => (
        <div key={t.desde} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-medium">
              Desde {t.desde} u: {t.descuento} %
            </span>{" "}
            <span className="text-muted-foreground">· piso {t.piso} %</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {t.peor ? `peor: ${t.peor.producto} ${String(t.peor.margen).replace(".", ",")} % · mediana ${String(t.mediana).replace(".", ",")} %` : "—"}
            {t.debajo > 0 && <span className="text-red-600 dark:text-red-400"> · {t.debajo} debajo del piso</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ConfiguracionDePrecios({ onGuardado }: { onGuardado: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [redondeo, setRedondeo] = useState<string>("");
  const [vista, setVista] = useState<{ ejemplos: Ejemplo[]; tramos: ResumenDeTramo[]; clave: string } | null>(null);
  const [ocupado, setOcupado] = useState<"simulando" | "guardando" | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await pedir<Datos>("/api/precios/configuracion");
      setDatos(d);
      setV(Object.fromEntries(d.campos.map((c) => [c.campo, String(d.config.gastos[c.campo] ?? "")])));
      setRedondeo(d.config.redondeo);
      setVista(null);
    } catch (e) {
      toast.error(`No se pudo leer la configuración: ${e instanceof Error ? e.message : e}`);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambios = useMemo(() => {
    if (!datos) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const c of datos.campos) {
      const n = Number(String(v[c.campo] ?? "").replace(",", "."));
      if (v[c.campo] !== "" && Number.isFinite(n) && n !== datos.config.gastos[c.campo]) out[c.campo] = n;
    }
    return out;
  }, [datos, v]);
  const clave = JSON.stringify({ cambios, redondeo });
  const hayCambios = Object.keys(cambios).length > 0 || (!!datos && redondeo !== datos.config.redondeo);

  async function verComoQueda() {
    setOcupado("simulando");
    try {
      const r = await pedir<{ ejemplos: Ejemplo[]; tramos: ResumenDeTramo[] }>("/api/precios/configuracion", json("POST", { cambios, redondeo }));
      setVista({ ...r, clave });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function guardar() {
    setOcupado("guardando");
    try {
      await pedir("/api/precios/configuracion", json("POST", { cambios, redondeo, aplicar: true }));
      toast.success("Configuración guardada. Los precios nuevos aparecen en las otras pestañas; no se publicó nada.");
      await cargar();
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  if (!datos) return <Skeleton className="h-96 rounded-xl" />;
  const campo = (d: DefinicionDeCampo) => (
    <label key={d.campo} className="space-y-1">
      <span className="text-sm font-medium">
        {d.etiqueta} <span className="text-xs text-muted-foreground font-normal">({d.unidad})</span>
      </span>
      <Input inputMode="decimal" value={v[d.campo] ?? ""} onChange={(e) => setV((p) => ({ ...p, [d.campo]: e.target.value }))} className={d.campo in cambios ? "border-primary" : ""} />
      <span className="block text-xs text-muted-foreground">{d.ayuda}</span>
    </label>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      {!datos.config.existe && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            El ERP todavía no tiene su configuración: Precios calcula con los gastos de Bodega. Se crea con la migración del SDD 006.
          </CardContent>
        </Card>
      )}

      {GRUPOS.map((g) => (
        <div key={g} className="space-y-2">
          <p className="text-sm font-semibold">{g}</p>
          {g === "Respaldo" && <p className="text-xs text-muted-foreground">La comisión, el cargo fijo y las cuotas salen de lo que cobra ML por cada publicación. Estos se usan sólo si ML no contesta.</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            {datos.campos.filter((c) => c.grupo === g).map(campo)}
            {g === "Margen y promo" && (
              <label className="space-y-1">
                <span className="text-sm font-medium">Redondeo</span>
                <select value={redondeo} onChange={(e) => setRedondeo(e.target.value)} className={`h-9 w-full rounded-md border bg-transparent px-2 text-sm ${redondeo !== datos.config.redondeo ? "border-primary" : ""}`}>
                  {REDONDEOS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-muted-foreground">Siempre para arriba, salvo que eso cruce un umbral de envío.</span>
              </label>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 sticky bottom-2 bg-background/95 backdrop-blur rounded-lg border p-3">
        <span className="text-sm text-muted-foreground mr-auto">
          {hayCambios ? `${Object.keys(cambios).length + (redondeo !== datos.config.redondeo ? 1 : 0)} cambios sin guardar` : "Sin cambios"}
          {datos.config.actualizadoEn && ` · guardada el ${new Date(datos.config.actualizadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}${datos.config.usuario ? ` por ${datos.config.usuario}` : ""}`}
        </span>
        <Button variant="outline" size="sm" disabled={!hayCambios || !!ocupado} onClick={cargar}>
          Descartar
        </Button>
        <Button variant="outline" size="sm" disabled={!hayCambios || !!ocupado} onClick={verComoQueda}>
          {ocupado === "simulando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Ver cómo queda
        </Button>
        <Button size="sm" disabled={!hayCambios || !!ocupado || !datos.config.existe || vista?.clave !== clave} onClick={guardar} title={vista?.clave !== clave ? "Primero mirá cómo queda" : undefined}>
          {ocupado === "guardando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Guardar
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold flex items-center gap-2">
          Cómo quedan {vista?.clave === clave && hayCambios && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
          {vista?.clave === clave && hayCambios && <span className="text-xs font-normal text-muted-foreground">tachado lo de hoy, al lado lo nuevo</span>}
        </p>
        <Ejemplos antes={datos.ejemplos} despues={vista?.clave === clave ? vista.ejemplos : null} />
        <p className="text-sm font-semibold pt-2">Descuentos por cantidad de la web</p>
        <Tramos tramos={vista?.clave === clave ? vista.tramos : datos.tramos} />
        <p className="text-xs text-muted-foreground">Los tramos se cargan en el panel del Shop. Se mide el pedido mínimo de cada tramo, con su envío si pasa el envío gratis.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Historial</p>
        {datos.historial.length ? (
          <div className="rounded-lg border divide-y text-sm">
            {datos.historial.map((h) => (
              <div key={h.id} className="px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {new Date(h.creadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                  {h.usuario ? ` · ${h.usuario}` : ""}
                </p>
                <p>
                  {h.cambios.length
                    ? h.cambios
                        .map((c) => {
                          const d = datos.campos.find((x) => x.campo === c.campo);
                          return d ? `${d.etiqueta}: ${valor(d, c.antes)} → ${valor(d, c.despues)}` : `${c.campo}: ${String(c.antes ?? "—")} → ${String(c.despues)}`;
                        })
                        .join(" · ")
                    : "Configuración inicial"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin cambios todavía.</p>
        )}
      </div>
    </div>
  );
}
