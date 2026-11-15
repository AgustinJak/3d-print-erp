"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, ExternalLink, FileBox, Globe, Zap } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { COLOR_DE_CUENTA, PuntoDeCuenta, useCuentaActiva, type DeCuenta } from "@/components/cuenta-activa";
import { pesos } from "@/components/producto/seccion";
import { diferenciasDe, type Fila, type PublicacionMl } from "@/lib/productos-lista";

/**
 * La ficha rápida de un producto (docs/sdd/011): se abre al costado de la lista, sin salir de
 * Productos ni perder los filtros ni lo elegido. Muestra lo de todos los días (las variantes con su
 * stock, lo vendido y sus publicaciones en cada cuenta) y lleva a la ficha completa para editar.
 */

const linkMl = (mla: string) => `https://articulo.mercadolibre.com.ar/${mla.replace(/^MLA/, "MLA-")}`;
const ESTADO = { active: "Activa", paused: "Pausada", otro: "Sin leer" } as const;

function Publicacion({ x }: { x: PublicacionMl }) {
  const punto = x.estado === "active" ? "bg-emerald-500" : x.estado === "paused" ? "bg-amber-500" : "bg-muted-foreground/40";
  return (
    <a href={linkMl(x.mla)} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-muted">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} />
        <span className="truncate">
          {x.premium ? "Premium" : "Clásica"} · {ESTADO[x.estado]}
          {x.flex && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground">
              · <Zap className="h-3 w-3" strokeWidth={1.5} /> Flex
            </span>
          )}
          {x.dias != null && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground">
              · <Clock className="h-3 w-3" strokeWidth={1.5} /> {x.dias} d
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {x.precio != null && <span className="font-mono tabular-nums">{pesos(x.precio)}</span>}
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
      </span>
    </a>
  );
}

export function PanelDeProducto({ fila, onCerrar }: { fila: Fila | null; onCerrar: () => void }) {
  const { alcance, cuentas } = useCuentaActiva();
  const abierta = !!fila;
  const p = fila?.p;
  const c = fila?.c;
  const deCuentas: DeCuenta[] = alcance === "todas" ? (cuentas.otra ? ["principal", "otra"] : ["principal"]) : [alcance];
  const nombreDe = (de: DeCuenta) => (de === "principal" ? cuentas.principal : cuentas.otra);

  return (
    <Sheet open={abierta} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-[480px]">
        {p && fila && (
          <>
            {/* La foto es el momento de la ficha */}
            <div className="relative aspect-[4/3] w-full shrink-0 bg-muted">
              {p.imagenUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagenUrl} alt={p.nombre} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <FileBox className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.5} />
                </div>
              )}
            </div>

            <div className="space-y-6 p-6">
              <div>
                <SheetTitle className="text-xl leading-tight font-medium">{p.nombre}</SheetTitle>
                <SheetDescription className="mt-1 flex flex-wrap gap-x-2 text-[13px]">
                  {p.serie && <span>{p.serie}</span>}
                  {p.sku && <code className="font-mono text-xs">{p.sku}</code>}
                  {!p.activo && <span className="text-red-600 dark:text-red-400">Inactivo</span>}
                </SheetDescription>
              </div>

              <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border">
                {(
                  [
                    ["Stock", c?.stock ?? "—"],
                    ["Vendidos 30 d", c?.vendidas30 ?? 0],
                    ["Costo", pesos((p.costoFab || 0) + (p.costoInsumos || 0))],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="bg-card p-3">
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-1 font-mono text-lg leading-none font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <section>
                <h3 className="mb-2 text-sm font-medium">
                  {fila.todas.length > 1 ? `${fila.todas.length} variantes` : "Publicaciones"}
                </h3>
                <div className="divide-y rounded-xl border">
                  {fila.todas.map((u) => {
                    const comb = u.comb;
                    if (!comb) return <p key={u.clave} className="p-3 text-[13px] text-muted-foreground">Sin variantes activas</p>;
                    const difiere = alcance === "todas" ? diferenciasDe(comb) : [];
                    return (
                      <div key={u.clave} className="space-y-2 p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium">{comb.corto}</span>
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">
                            stock {comb.stock ?? "—"} · {comb.vendidas30} en 30 d
                          </span>
                        </div>
                        {deCuentas.map((de) => {
                          const pubs = comb.publicaciones.filter((x) => (de === "otra") === !!x.cuenta);
                          return (
                            <div key={de}>
                              {deCuentas.length > 1 && (
                                <p className={`mb-0.5 flex items-center gap-1.5 px-2 text-xs ${COLOR_DE_CUENTA[de].texto}`}>
                                  <PuntoDeCuenta de={de} /> {nombreDe(de)}
                                </p>
                              )}
                              {pubs.length ? (
                                pubs.map((x) => <Publicacion key={x.mla} x={x} />)
                              ) : (
                                <p className="px-2 py-1 text-[13px] text-muted-foreground">{de === "otra" ? "Sin copiar" : "Sin publicar"}</p>
                              )}
                            </div>
                          );
                        })}
                        {difiere.length > 0 && <p className="px-2 text-xs text-amber-700 dark:text-amber-400">No coincide entre cuentas: {difiere.join(", ")}</p>}
                        {comb.web && (
                          <p className="flex items-center gap-1.5 px-2 text-[13px] text-muted-foreground">
                            <Globe className="h-3.5 w-3.5" strokeWidth={1.5} /> En la web
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="flex gap-2">
                <Link href={`/modelos/${p.id}`} className={buttonVariants({ className: "h-9 flex-1" })}>
                  Abrir la ficha completa <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
                </Link>
                <Link href={`/precios?modelo=${p.id}`} className={buttonVariants({ variant: "outline", className: "h-9" })}>
                  Precios
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
