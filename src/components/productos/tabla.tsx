"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Clock, FileBox, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pesos } from "@/components/producto/seccion";
import { estadoDeTilde, type CombinacionLista, type EstadoDeTilde, type Fila, type Grupo, type Orden, type PublicacionMl } from "@/lib/productos-lista";

/**
 * La tabla de Productos (docs/sdd/008). Un producto con variantes se abre y muestra cada una con su
 * stock, sus ventas y su publicación de ML; lo que se tilda son las variantes. Con la lista agrupada,
 * el encabezado de cada grupo suma el grupo entero a lo elegido.
 */

const COLUMNAS = 7;
const vendidosEn30 = (n: number) => `${n} ${n === 1 ? "vendido" : "vendidos"} en 30 d`;

function Tilde({ estado, onChange, etiqueta }: { estado: EstadoDeTilde; onChange: () => void; etiqueta: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === "algunas";
  }, [estado]);
  return <input ref={ref} type="checkbox" aria-label={etiqueta} checked={estado === "todas"} onChange={onChange} className="h-4 w-4 rounded border-input accent-primary cursor-pointer align-middle" />;
}

const TONO = {
  verde: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  ambar: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  azul: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  gris: "bg-muted text-muted-foreground",
  hueco: "border border-dashed border-amber-500/50 text-amber-700 dark:text-amber-400",
} as const;

function Chip({ tono, children, titulo }: { tono: keyof typeof TONO; children: React.ReactNode; titulo?: string }) {
  return (
    <span title={titulo} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap ${TONO[tono]}`}>
      {children}
    </span>
  );
}

const ESTADO_DE_PUBLICACION = { active: "activa", paused: "pausada", otro: "sin leer" } as const;

/** Una publicación: tipo, y cómo se entrega. El punto dice si está activa. */
function ChipDePublicacion({ x }: { x: PublicacionMl }) {
  const punto = x.estado === "active" ? "bg-emerald-500" : x.estado === "paused" ? "bg-amber-500" : "bg-muted-foreground/50";
  return (
    <Chip tono={x.estado === "paused" ? "ambar" : x.flex ? "azul" : "gris"} titulo={`${x.mla} · ${ESTADO_DE_PUBLICACION[x.estado]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${punto}`} />
      {x.premium ? "Premium" : "Clásica"}
      {x.estado === "paused" && " · pausada"}
      {x.flex && (
        <>
          <Zap className="h-3 w-3" /> Flex
        </>
      )}
      {x.dias != null && (
        <>
          <Clock className="h-3 w-3" /> {x.dias} d
        </>
      )}
    </Chip>
  );
}

function PublicacionesDe({ comb }: { comb: CombinacionLista | null }) {
  if (!comb) return <span className="text-xs text-muted-foreground">—</span>;
  if (!comb.publicaciones.length) return <Chip tono="hueco">Sin publicar</Chip>;
  return (
    <div className="flex flex-wrap gap-1">
      {comb.publicaciones.map((x) => (
        <ChipDePublicacion key={x.mla} x={x} />
      ))}
    </div>
  );
}

/** Lo de ML de un producto con varias variantes, en números: sólo las variantes que se ven. */
function ResumenDeMl({ f }: { f: Fila }) {
  const pubs = f.unidades.flatMap((u) => u.comb?.publicaciones ?? []);
  const n = (si: (x: PublicacionMl) => boolean) => pubs.filter(si).length;
  const activas = n((x) => x.estado === "active");
  const pausadas = n((x) => x.estado === "paused");
  const sinLeer = n((x) => x.estado === "otro");
  const flex = n((x) => x.flex);
  const aPedido = n((x) => x.dias != null);
  const sinPublicar = f.unidades.filter((u) => u.comb && !u.comb.publicaciones.length).length;
  if (!pubs.length && !sinPublicar) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {activas > 0 && <Chip tono="verde">{activas} {activas === 1 ? "activa" : "activas"}</Chip>}
      {pausadas > 0 && <Chip tono="ambar">{pausadas} {pausadas === 1 ? "pausada" : "pausadas"}</Chip>}
      {sinLeer > 0 && <Chip tono="gris">{sinLeer} sin leer</Chip>}
      {flex > 0 && (
        <Chip tono="azul">
          <Zap className="h-3 w-3" /> {flex} Flex
        </Chip>
      )}
      {aPedido > 0 && (
        <Chip tono="gris">
          <Clock className="h-3 w-3" /> {aPedido} a pedido
        </Chip>
      )}
      {sinPublicar > 0 && <Chip tono="hueco">{sinPublicar} sin publicar</Chip>}
    </div>
  );
}

function Stock({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="text-muted-foreground">—</span>;
  // Casi todo se hace a pedido: un cero es lo normal, no una alarma.
  return <span className={n > 0 ? "font-medium" : "text-muted-foreground"}>{n}</span>;
}

function Vendidas({ d30, total }: { d30: number; total: number }) {
  return (
    <>
      {d30 > 0 ? d30 : <span className="text-muted-foreground">—</span>}
      {total > 0 && <div className="text-[10px] text-muted-foreground">{total} en total</div>}
    </>
  );
}

function Foto({ url, nombre, clase }: { url: string | null; nombre: string; clase: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={nombre} loading="lazy" className={`${clase} object-cover`} />
  ) : (
    <div className={`${clase} bg-muted flex items-center justify-center`}>
      <FileBox className="h-1/2 w-1/2 text-muted-foreground/50" />
    </div>
  );
}

function Categorias({ p }: { p: Fila["p"] }) {
  if (!p.categorias.length) return null;
  return (
    <>
      {p.categorias.map(({ categoria: c }) => (
        <span key={c.id} className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" style={c.color ? { backgroundColor: c.color } : undefined} />
          {c.nombre}
        </span>
      ))}
    </>
  );
}

const ORDEN_DE_COLUMNA = {
  nombre: ["az", "za"],
  stock: ["stock_mas", "stock_menos"],
  vendidos: ["vendidos30", "menos_vendidos30"],
  costo: ["costo_mas", "costo_menos"],
} as const satisfies Record<string, readonly [Orden, Orden]>;

function Encabezado({ columna, orden, onOrden, children, derecha }: { columna: keyof typeof ORDEN_DE_COLUMNA; orden: Orden; onOrden: (o: Orden) => void; children: React.ReactNode; derecha?: boolean }) {
  const [primero, segundo] = ORDEN_DE_COLUMNA[columna];
  const puesto = orden === primero || orden === segundo;
  // La flecha dice hacia dónde crece: en el nombre, A → Z es para abajo; en los números, de más a menos.
  const Flecha = orden === segundo ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onOrden(orden === primero ? segundo : primero)}
      className={`inline-flex items-center gap-1 hover:text-foreground ${puesto ? "text-foreground" : ""} ${derecha ? "flex-row-reverse" : ""}`}
      title="Ordenar por esta columna"
    >
      {children}
      {puesto && <Flecha className="h-3 w-3" />}
    </button>
  );
}

export function TablaDeProductos({
  grupos,
  agrupado,
  elegidos,
  onAlternar,
  orden,
  onOrden,
  verVariantes,
  onAbrir,
}: {
  grupos: Grupo[];
  agrupado: boolean;
  elegidos: ReadonlySet<string>;
  /** Tilda o destilda estas claves, sin tocar el resto de lo elegido. */
  onAlternar: (claves: string[]) => void;
  orden: Orden;
  onOrden: (o: Orden) => void;
  /** Todos los productos con variantes, abiertos. */
  verVariantes: boolean;
  onAbrir: (id: string) => void;
}) {
  // Lo que se abrió o cerró a mano gana sobre lo que viene dado.
  const [aMano, setAMano] = useState<Record<string, boolean>>({});
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const todas = grupos.flatMap((g) => g.filas.flatMap((f) => f.unidades.map((u) => u.clave)));
  const unicas = [...new Set(todas)];

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
            <TableHead className="w-9 pl-3">
              <Tilde estado={estadoDeTilde(unicas, elegidos)} onChange={() => onAlternar(unicas)} etiqueta="Elegir todo lo que se ve" />
            </TableHead>
            <TableHead className="min-w-[240px]">
              <Encabezado columna="nombre" orden={orden} onOrden={onOrden}>
                Producto
              </Encabezado>
            </TableHead>
            <TableHead className="text-right w-20">
              <Encabezado columna="stock" orden={orden} onOrden={onOrden} derecha>
                Stock
              </Encabezado>
            </TableHead>
            <TableHead className="text-right w-28">
              <Encabezado columna="vendidos" orden={orden} onOrden={onOrden} derecha>
                Vendidos 30 d
              </Encabezado>
            </TableHead>
            <TableHead className="text-right w-24">
              <Encabezado columna="costo" orden={orden} onOrden={onOrden} derecha>
                Costo
              </Encabezado>
            </TableHead>
            <TableHead>Mercado Libre</TableHead>
            <TableHead className="w-24">Web</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map((g) => {
            const clavesDelGrupo = g.filas.flatMap((f) => f.unidades.map((u) => u.clave));
            const cerrado = agrupado && cerrados.has(g.clave);
            const estadoDelGrupo = estadoDeTilde(clavesDelGrupo, elegidos);
            return (
              <Fragment key={g.clave || "todo"}>
                {agrupado && (
                  <TableRow className="bg-muted/60 hover:bg-muted/60 border-t-2">
                    <TableCell className="pl-3 py-2">
                      <Tilde estado={estadoDelGrupo} onChange={() => onAlternar(clavesDelGrupo)} etiqueta={`Elegir el grupo ${g.nombre}`} />
                    </TableCell>
                    <TableCell colSpan={COLUMNAS - 1} className="py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          aria-expanded={!cerrado}
                          onClick={() =>
                            setCerrados((prev) => {
                              const s = new Set(prev);
                              if (!s.delete(g.clave)) s.add(g.clave);
                              return s;
                            })
                          }
                          className="inline-flex items-center gap-1.5 font-semibold hover:text-primary"
                        >
                          {cerrado ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {g.nombre}
                        </button>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {g.filas.length} {g.filas.length === 1 ? "producto" : "productos"}
                          {clavesDelGrupo.length > g.filas.length && ` · ${clavesDelGrupo.length} variantes`}
                          {" · stock "}
                          {g.filas.reduce((s, f) => s + (f.c?.stock ?? 0), 0)}
                          {" · "}
                          {vendidosEn30(g.filas.reduce((s, f) => s + (f.c?.vendidas30 ?? 0), 0))}
                        </span>
                        <button type="button" onClick={() => onAlternar(clavesDelGrupo)} className="ml-auto text-xs text-primary hover:underline">
                          {estadoDelGrupo === "todas" ? "Quitar el grupo de lo elegido" : "Sumar el grupo a lo elegido"}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!cerrado &&
                  g.filas.map((f) => {
                    const { p, c } = f;
                    const conVariantes = f.todas.length > 1;
                    const abierto = conVariantes && (aMano[p.id] ?? (verVariantes || f.parcial));
                    const claves = f.unidades.map((u) => u.clave);
                    const estado = estadoDeTilde(claves, elegidos);
                    const unica = conVariantes ? null : f.unidades[0].comb;
                    return (
                      <Fragment key={`${g.clave}|${p.id}`}>
                        <TableRow className={`cursor-pointer ${estado !== "ninguna" ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"}`} onClick={() => onAbrir(p.id)}>
                          <TableCell className="pl-3" onClick={(e) => e.stopPropagation()}>
                            <Tilde estado={estado} onChange={() => onAlternar(claves)} etiqueta={`Elegir ${p.nombre}`} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Foto url={p.imagenUrl} nombre={p.nombre} clase="h-10 w-10 rounded-md shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{p.nombre}</span>
                                  {!p.activo && <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Inactivo</Badge>}
                                  {!p.sku && !p.consolidadoEn && !p.esInsumo && (
                                    <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] py-0 px-1.5">
                                      Sin SKU
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                  {p.serie && <span>{p.serie}</span>}
                                  {p.sku && <code className="font-mono text-[10px]">{p.sku}</code>}
                                  <Categorias p={p} />
                                </div>
                                {p.consolidadoEn && <div className="text-xs text-amber-600 dark:text-amber-400">↪ Consolidado en {p.consolidadoEn.nombre}</div>}
                                {conVariantes && (
                                  <button
                                    type="button"
                                    aria-expanded={abierto}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAMano((prev) => ({ ...prev, [p.id]: !abierto }));
                                    }}
                                    className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                                  >
                                    {abierto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    {f.parcial ? `${f.unidades.length} de ${f.todas.length} variantes` : `${f.todas.length} variantes`}
                                    {estado === "algunas" && ` · ${claves.filter((k) => elegidos.has(k)).length} elegidas`}
                                  </button>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Stock n={conVariantes ? c?.stock : (unica?.stock ?? c?.stock)} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Vendidas d30={c?.vendidas30 ?? 0} total={c?.vendidas ?? 0} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pesos((p.costoFab || 0) + (p.costoInsumos || 0))}
                            {p.costoInsumos > 0 && <div className="text-[10px] text-muted-foreground">{pesos(p.costoInsumos)} de insumos</div>}
                          </TableCell>
                          <TableCell>{conVariantes ? <ResumenDeMl f={f} /> : <PublicacionesDe comb={unica} />}</TableCell>
                          <TableCell className="text-xs">
                            {(() => {
                              const enWeb = f.unidades.filter((u) => u.comb?.web).length;
                              if (!enWeb) return <span className="text-muted-foreground">—</span>;
                              return conVariantes && enWeb < f.unidades.length ? `${enWeb} de ${f.unidades.length}` : "En la web";
                            })()}
                          </TableCell>
                        </TableRow>
                        {abierto &&
                          f.unidades.map((u) => {
                            const comb = u.comb!;
                            const tildada = elegidos.has(u.clave);
                            return (
                              <TableRow key={u.clave} className={`cursor-pointer text-[13px] ${tildada ? "bg-primary/5 hover:bg-primary/10" : "bg-muted/20 hover:bg-muted/40"}`} onClick={() => onAlternar([u.clave])}>
                                <TableCell className="pl-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                                  <Tilde estado={tildada ? "todas" : "ninguna"} onChange={() => onAlternar([u.clave])} etiqueta={`Elegir ${comb.nombre}`} />
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <span className="ml-[52px] border-l-2 border-border pl-3">{comb.corto}</span>
                                </TableCell>
                                <TableCell className="py-1.5 text-right tabular-nums">
                                  <Stock n={comb.stock} />
                                </TableCell>
                                <TableCell className="py-1.5 text-right tabular-nums">
                                  <Vendidas d30={comb.vendidas30} total={comb.vendidas} />
                                </TableCell>
                                <TableCell className="py-1.5" />
                                <TableCell className="py-1.5">
                                  <PublicacionesDe comb={comb} />
                                </TableCell>
                                <TableCell className="py-1.5 text-xs">{comb.web ? "En la web" : <span className="text-muted-foreground">—</span>}</TableCell>
                              </TableRow>
                            );
                          })}
                      </Fragment>
                    );
                  })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Las tarjetas: en el teléfono, y como vista alternativa. Tildar una elige el producto entero. */
export function TarjetasDeProductos({ grupos, agrupado, elegidos, onAlternar, onAbrir }: { grupos: Grupo[]; agrupado: boolean; elegidos: ReadonlySet<string>; onAlternar: (claves: string[]) => void; onAbrir: (id: string) => void }) {
  return (
    <div className="space-y-6">
      {grupos.map((g) => {
        const clavesDelGrupo = g.filas.flatMap((f) => f.unidades.map((u) => u.clave));
        return (
          <section key={g.clave || "todo"} className="space-y-3">
            {agrupado && (
              <div className="flex flex-wrap items-center gap-3 border-b pb-1.5">
                <h2 className="font-semibold">{g.nombre}</h2>
                <span className="text-xs text-muted-foreground">
                  {g.filas.length} {g.filas.length === 1 ? "producto" : "productos"}
                </span>
                <button type="button" onClick={() => onAlternar(clavesDelGrupo)} className="ml-auto text-xs text-primary hover:underline">
                  {estadoDeTilde(clavesDelGrupo, elegidos) === "todas" ? "Quitar el grupo de lo elegido" : "Sumar el grupo a lo elegido"}
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {g.filas.map((f) => {
                const { p, c } = f;
                const claves = f.unidades.map((u) => u.clave);
                const estado = estadoDeTilde(claves, elegidos);
                return (
                  <Card key={p.id} className={`cursor-pointer overflow-hidden transition-shadow hover:shadow-lg ${estado !== "ninguna" ? "ring-2 ring-primary/60" : ""}`} onClick={() => onAbrir(p.id)}>
                    <div className="relative aspect-square w-full bg-muted">
                      <Foto url={p.imagenUrl} nombre={p.nombre} clase="h-full w-full" />
                      <span className="absolute top-2 left-2 rounded bg-background/90 p-1 leading-none" onClick={(e) => e.stopPropagation()}>
                        <Tilde estado={estado} onChange={() => onAlternar(claves)} etiqueta={`Elegir ${p.nombre}`} />
                      </span>
                      {!p.activo && (
                        <Badge variant="destructive" className="absolute top-2 right-2">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2 px-4 pb-4">
                      <div>
                        <h3 className="font-semibold truncate" title={p.nombre}>
                          {p.nombre}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {[p.serie, f.todas.length > 1 ? `${f.todas.length} variantes` : null, `stock ${c?.stock ?? "—"}`, c?.vendidas30 ? vendidosEn30(c.vendidas30) : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <ResumenDeMl f={f} />
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
