"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ExternalLink, FileBox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PuntoDeCuenta, useCuentaActiva } from "@/components/cuenta-activa";
import { pesos } from "@/components/producto/seccion";
import { EditorAjustes } from "@/components/precios/editor-ajustes";
import { EtiquetaAjuste } from "@/components/precios/etiqueta-ajuste";
import { aplicableDeCanal, aplicableDeErp, pct, sePuedeMl, type Aplicable, type Producto } from "@/components/precios/por-producto";
import { conDiferencia, esGrande, PREFIJO_FALTA, textoDeFalta } from "@/lib/precios-reglas";
import type { Deja, FilaDeCanal, OpcionesMl, ResultadoFila } from "@/lib/precios-propuesta";

/**
 * La ficha de precios de un producto (docs/sdd/015): sus tres canales, sus ajustes, y cada
 * publicación con lo que tiene y lo que se propone. Aplicar sigue pidiendo confirmación en la
 * pantalla; desde acá sólo se elige qué.
 */

export function LineaDeja({ d }: { d: Deja | null }) {
  if (!d) return null;
  return (
    <div className={`text-xs ${d.ganancia < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} title="Lo que te queda por venta, después de comisiones, envío, impuestos y el costo">
      deja <span className="font-mono tabular-nums">{pesos(d.ganancia)}</span> · {String(d.margen).replace(".", ",")} %
    </div>
  );
}

export function Diferencia({ diferencia, porcentaje }: { diferencia: number | null; porcentaje: number | null }) {
  if (diferencia == null || Math.abs(diferencia) <= 1) return null;
  const grande = esGrande(porcentaje);
  return (
    <span className={`font-mono text-xs tabular-nums ${grande ? "font-medium text-destructive" : "text-muted-foreground"}`}>
      {diferencia > 0 ? "+" : "−"}
      {pesos(Math.abs(diferencia))} · {pct(porcentaje)}
    </span>
  );
}

export function Resultado({ r }: { r: ResultadoFila | undefined }) {
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

/** Lo publicado y lo propuesto, en una línea: "$ 24.090 → $ 25.890". */
function AntesDespues({ antes, despues }: { antes: number | null; despues: number | null }) {
  const cambia = antes != null && despues != null && Math.abs(antes - despues) > 1;
  return (
    <div className="font-mono text-sm tabular-nums whitespace-nowrap">
      {cambia ? (
        <>
          <span className="text-muted-foreground line-through decoration-muted-foreground/40">{pesos(antes!)}</span> <span className="text-muted-foreground">→</span>{" "}
          <span className="font-medium">{pesos(despues!)}</span>
        </>
      ) : (
        <span>{despues != null ? pesos(despues) : antes != null ? pesos(antes) : "—"}</span>
      )}
    </div>
  );
}

function Seccion({ titulo, detalle, acciones, children }: { titulo: string; detalle?: React.ReactNode; acciones?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
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

function LineaOpciones({ o }: { o: OpcionesMl | undefined }) {
  if (!o) return <span className="text-muted-foreground">sin publicar en ML</span>;
  if (o.uno > 0 && o.dos > 0) return <span className="text-muted-foreground">opción 1 y 2 publicadas</span>;
  const falta = o.uno === 0 ? 1 : 2;
  const precio = falta === 1 ? o.precioUno : o.precioDos;
  return (
    <span className="text-amber-600 dark:text-amber-400" title={falta === 2 ? "3 cuotas sin interés y envío gratis, dejando lo mismo que la opción 1. Aproximado: el envío depende del precio final" : "Clásica, sin cuotas"}>
      falta la opción {falta}
      {precio != null && ` · publicaría ${falta === 2 ? "unos " : ""}${pesos(precio)}`}
    </span>
  );
}

export interface AccionesFicha {
  onAplicar: (canal: "mercadolibre" | "shop" | "erp", filas: Aplicable[]) => void;
  onFlex: (prender: boolean, mlas: string[]) => void;
  onRecargar: () => void;
  resultados: Map<string, ResultadoFila>;
  opcionesMl: Record<string, OpcionesMl>;
}

export function FichaPrecio({ producto: p, onCerrar, ...a }: { producto: Producto | null; onCerrar: () => void } & AccionesFicha) {
  return (
    <Sheet open={!!p} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-[620px]">
        {p && <Contenido key={p.id} p={p} {...a} />}
      </SheetContent>
    </Sheet>
  );
}

function Contenido({ p, onAplicar, onFlex, onRecargar, resultados, opcionesMl }: { p: Producto } & AccionesFicha) {
  const { alcance, cuentas } = useCuentaActiva();
  const conCuenta = alcance === "todas" && !!cuentas.otra;
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const b = p.base?.precios ?? null;
  const politica = p.base?.politica ?? p.combinaciones[0]?.politica;
  const costo = p.base?.costo ? p.base.costo.fabricacion + p.base.costo.insumos : null;
  const pctDe = (c: "ml" | "web" | "personalizado") => politica?.ajustes?.pct[c];

  const elegidasMl = p.ml.filter((f) => elegidas.has(f.clave));
  const aplicablesElegidas = elegidasMl.filter(sePuedeMl);
  const mlasElegidas = [...new Set(elegidasMl.map((f) => f.clave.split("|")[0]))];
  const alternar = (clave: string) =>
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave);
      else s.add(clave);
      return s;
    });

  const canales = [
    { k: "ml" as const, nombre: "Mercado Libre", precio: b?.mlPublicado, sub: b && b.mlPublicado !== b.ml ? `paga ${pesos(b.ml)}` : null },
    { k: "web" as const, nombre: "Web", precio: b?.web, sub: null },
    { k: "personalizado" as const, nombre: "Venta directa", precio: b?.personalizado, sub: null },
  ];

  return (
    <>
      <div className="flex gap-4 border-b p-6">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
          {p.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.foto} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <FileBox className="h-7 w-7 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <SheetTitle className="pr-8 text-xl leading-tight font-medium">{p.nombre}</SheetTitle>
          <SheetDescription className="flex flex-wrap gap-x-2 text-[13px]">
            <span>
              {p.combinaciones.length} {p.combinaciones.length === 1 ? "combinación" : "combinaciones"}
            </span>
            {politica && (
              <span>
                · margen {politica.margen} %{politica.margenPropio ? " propio" : ""}
              </span>
            )}
            {costo != null && <span>· costo desde {pesos(costo)}</span>}
          </SheetDescription>
          <Link href={`/modelos/${p.id}`} className="inline-flex items-center gap-0.5 text-[13px] text-muted-foreground hover:text-foreground">
            Abrir el producto <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="space-y-7 p-6">
        {b ? (
          <div className="space-y-2">
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
              {canales.map((c) => (
                <div key={c.k} className="bg-card p-3">
                  <dt className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                    {c.nombre}
                    {pctDe(c.k) != null && (
                      <span className="font-mono text-[11px] text-foreground tabular-nums">
                        {pctDe(c.k)! > 0 ? "+" : ""}
                        {String(pctDe(c.k)).replace(".", ",")} %
                      </span>
                    )}
                  </dt>
                  <dd className="mt-1.5 font-mono text-lg leading-none font-medium tabular-nums">{c.precio != null ? pesos(c.precio) : "—"}</dd>
                  {c.sub && <dd className="mt-1 text-xs text-muted-foreground">{c.sub}</dd>}
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              {p.combinaciones.length > 1 ? `${p.base!.nombre}, la combinación más barata. ` : ""}
              {b.ganancia != null && (
                <>
                  Deja <span className="font-mono tabular-nums">{pesos(b.ganancia)}</span> por venta antes de los ajustes.
                </>
              )}
            </p>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {p.combinaciones.length ? textoDeFalta(p.combinaciones[0].falta) : "Este producto no tiene combinaciones activas."}
          </p>
        )}

        <Seccion titulo="Ajustes" detalle="Un % por canal o un envío propio, con fecha de fin si es una promo. No publica nada: cambia lo que se propone.">
          <EditorAjustes modeloIds={[p.id]} ajustes={p.ajustes} onGuardado={onRecargar} />
        </Seccion>

        <Seccion
          titulo="Mercado Libre"
          detalle={p.ml.length ? `${p.ml.length} ${p.ml.length === 1 ? "publicación" : "publicaciones"}` : "Sin publicaciones con este producto."}
          acciones={
            elegidasMl.length > 0 ? (
              <>
                <Button size="sm" variant="outline" onClick={() => onFlex(true, mlasElegidas)} title="Sin tiempo de disponibilidad y con Flex">
                  Flex
                </Button>
                <Button size="sm" variant="outline" onClick={() => onFlex(false, mlasElegidas)} title="Sin Flex y con días de disponibilidad">
                  A pedido
                </Button>
                {aplicablesElegidas.length > 0 && (
                  <Button size="sm" onClick={() => onAplicar("mercadolibre", aplicablesElegidas.map(aplicableDeCanal))}>
                    Aplicar {aplicablesElegidas.length}
                  </Button>
                )}
              </>
            ) : p.pendientes.ml.length > 1 ? (
              <Button size="sm" onClick={() => onAplicar("mercadolibre", p.pendientes.ml.map(aplicableDeCanal))}>
                Aplicar las {p.pendientes.ml.length}
              </Button>
            ) : null
          }
        >
          {p.ml.length > 0 && (
            <div className="divide-y rounded-xl border">
              {p.ml.map((f) => (
                <FilaPublicacion
                  key={f.clave}
                  f={f}
                  conCuenta={conCuenta}
                  elegida={elegidas.has(f.clave)}
                  onElegir={() => alternar(f.clave)}
                  resultado={resultados.get(f.clave)}
                  onAplicar={sePuedeMl(f) ? () => onAplicar("mercadolibre", [aplicableDeCanal(f)]) : undefined}
                />
              ))}
            </div>
          )}
        </Seccion>

        <Seccion
          titulo="Web"
          detalle={p.web.length ? "Va el producto entero: el Shop reparte base y extras." : "No está en la web."}
          acciones={
            p.pendientes.web.length > 0 ? (
              <Button size="sm" onClick={() => onAplicar("shop", p.pendientes.web.map(aplicableDeCanal))}>
                Aplicar en la web
              </Button>
            ) : null
          }
        >
          {p.web.length > 0 && (
            <div className="divide-y rounded-xl border">
              {p.web.map((f) => (
                <FilaPublicacion key={f.clave} f={f} resultado={resultados.get(f.clave)} />
              ))}
            </div>
          )}
        </Seccion>

        {p.erp && (
          <Seccion
            titulo="Venta directa en el ERP"
            detalle="El precio de la combinación más barata; cada opción suma su diferencia."
            acciones={
              p.pendientes.erp ? (
                <Button size="sm" variant={esGrande(p.erp.pct) ? "destructive" : "default"} onClick={() => onAplicar("erp", [aplicableDeErp(p.erp!)])}>
                  Aplicar en el ERP
                </Button>
              ) : null
            }
          >
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  Precio de venta
                  {p.erp.motivo && <div className="text-xs text-muted-foreground">{p.erp.motivo}</div>}
                  <Resultado r={resultados.get(p.erp.modeloId)} />
                </div>
                <div className="text-right">
                  <AntesDespues antes={p.erp.actual} despues={p.erp.propuesto} />
                  <Diferencia diferencia={p.erp.diferencia} porcentaje={p.erp.pct} />
                  <LineaDeja d={p.erp.deja.propuesto ?? p.erp.deja.hoy} />
                </div>
              </div>
              {p.erp.adicionales.some((x) => x.propuesto > 0 || x.actual > 0) && (
                <ul className="space-y-0.5 border-t pt-2 text-xs text-muted-foreground">
                  {p.erp.adicionales
                    .filter((x) => x.propuesto > 0 || x.actual > 0)
                    .map((x) => (
                      <li key={x.varianteId} className="flex justify-between gap-3">
                        <span className="truncate">{x.nombre}</span>
                        <span className="font-mono tabular-nums">
                          +{pesos(x.actual)}
                          {Math.abs(x.propuesto - x.actual) > 1 && <> → +{pesos(x.propuesto)}</>}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              {p.erp.desvios > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{p.erp.desvios} combinaciones no suman exacto</p>}
            </div>
          </Seccion>
        )}

        {p.combinaciones.length > 0 && (
          <Seccion titulo="Combinaciones" detalle="Lo que calcula el ERP para cada una, con los ajustes vigentes.">
            <div className="divide-y rounded-xl border">
              {p.combinaciones.map((c) => (
                <div key={c.combinacionId} className="space-y-1 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{c.nombre}</span>
                    {c.costo && (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums" title={`Fabricación ${pesos(c.costo.fabricacion)} + insumos ${pesos(c.costo.insumos)}`}>
                        costo {pesos(c.costo.fabricacion + c.costo.insumos)}
                        {c.costo.pieza.insumosSinDeclarar && <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-500" aria-label="Bodega no tiene los insumos de la pieza" />}
                      </span>
                    )}
                  </div>
                  {c.precios ? (
                    <div className="grid grid-cols-3 gap-2 font-mono text-[13px] tabular-nums">
                      <span>
                        <span className="font-sans text-xs text-muted-foreground">ML </span>
                        {pesos(c.precios.mlPublicado)}
                      </span>
                      <span>
                        <span className="font-sans text-xs text-muted-foreground">Web </span>
                        {pesos(c.precios.web)}
                      </span>
                      <span>
                        <span className="font-sans text-xs text-muted-foreground">Directa </span>
                        {pesos(c.precios.personalizado)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{textoDeFalta(c.falta).replace(`${PREFIJO_FALTA} — `, "Falta costear: ")}</p>
                  )}
                  {c.precios && (
                    <p className="text-xs">
                      <LineaOpciones o={opcionesMl[c.combinacionId]} />
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Seccion>
        )}

        {p.ajustes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t pt-4">
            {p.ajustes.map((x) => (
              <EtiquetaAjuste key={x.id} a={x} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FilaPublicacion({
  f,
  conCuenta,
  elegida,
  onElegir,
  resultado,
  onAplicar,
}: {
  f: FilaDeCanal;
  conCuenta?: boolean;
  elegida?: boolean;
  onElegir?: () => void;
  resultado: ResultadoFila | undefined;
  onAplicar?: () => void;
}) {
  const { cuentas } = useCuentaActiva();
  const cambia = !f.motivo && conDiferencia(f);
  return (
    <div className={`flex gap-3 p-3 transition-colors ${elegida ? "bg-primary/[0.05]" : ""}`}>
      {onElegir && <input type="checkbox" className="mt-1 accent-primary" checked={!!elegida} onChange={onElegir} aria-label="Elegir la publicación" />}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="truncate text-sm">{f.combinacion ?? f.titulo ?? f.clave}</div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {conCuenta && f.cuentaMl && (
            <span className="inline-flex items-center gap-1">
              <PuntoDeCuenta de={f.cuentaMl} />
              {f.cuentaMl === "principal" ? cuentas.principal : cuentas.otra} ·
            </span>
          )}
          {f.enlace ? (
            <a href={f.enlace} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-mono hover:text-foreground">
              {f.clave.replace(/\|$/, "")} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="truncate">{f.titulo ?? f.clave}</span>
          )}
          {f.unidades > 1 && <span>· pack x{f.unidades}</span>}
          {f.etiquetas.map((e) => (
            <span key={e} className="rounded border px-1 text-[10px] leading-4">
              {e}
            </span>
          ))}
        </div>
        {f.porque && <div className="text-[11px] text-muted-foreground">{f.porque}</div>}
        {f.motivo && <div className="text-xs text-muted-foreground">{f.motivo}</div>}
        {!f.motivo && f.aviso && <div className={`text-xs ${f.aparte ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>{f.aviso}</div>}
        <Resultado r={resultado} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <AntesDespues antes={f.publicado} despues={f.propuesto} />
        {f.paga != null && f.publicado != null && Math.abs(f.paga - f.publicado) > 1 && <div className="text-xs text-muted-foreground">paga {pesos(f.paga)}</div>}
        {cambia ? <Diferencia diferencia={f.diferencia} porcentaje={f.pct} /> : !f.motivo && <span className="text-xs text-muted-foreground">al día</span>}
        <LineaDeja d={f.deja.propuesto ?? f.deja.hoy} />
        {onAplicar && (
          <Button size="sm" variant={f.aparte ? "destructive" : "outline"} className="mt-1 h-7" onClick={onAplicar}>
            Aplicar
          </Button>
        )}
      </div>
    </div>
  );
}
