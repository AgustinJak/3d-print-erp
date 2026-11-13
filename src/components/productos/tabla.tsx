"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronRight, Clock, FileBox, Globe, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { COLOR_DE_CUENTA, EtiquetaDeCuenta, PuntoDeCuenta, type DeCuenta } from "@/components/cuenta-activa";
import { pesos } from "@/components/producto/seccion";
import { diferenciasDe, estadoDeTilde, type Alcance, type CombinacionLista, type EstadoDeTilde, type Fila, type Grupo, type Orden, type PublicacionMl } from "@/lib/productos-lista";

/**
 * La lista de Productos (docs/sdd/008 y 011). Un producto con variantes se abre y muestra cada una
 * con su stock, sus ventas y sus publicaciones de ML; lo que se tilda son las variantes. Con la lista
 * agrupada, el encabezado de cada grupo suma el grupo entero a lo elegido.
 *
 * Con dos cuentas de ML, cada una tiene su columna: mirando "Todas" se ven las dos lado a lado y se
 * marca lo que no está igual; mirando una, sólo la suya.
 */

const vendidosEn30 = (n: number) => `${n} ${n === 1 ? "vendido" : "vendidos"} en 30 d`;
const SUAVE = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

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
  hueco: "border border-dashed border-muted-foreground/30 text-muted-foreground",
  distinto: "bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/30",
} as const;

function Chip({ tono, children, titulo }: { tono: keyof typeof TONO; children: React.ReactNode; titulo?: string }) {
  return (
    <span title={titulo} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap ${TONO[tono]}`}>
      {children}
    </span>
  );
}

const ESTADO_DE_PUBLICACION = { active: "activa", paused: "pausada", otro: "sin leer" } as const;
const deCuenta = (x: PublicacionMl): DeCuenta => (x.cuenta ? "otra" : "principal");

/** Una publicación: si está activa (el punto), el tipo, cómo se entrega y el precio. */
function ChipDePublicacion({ x }: { x: PublicacionMl }) {
  const punto = x.estado === "active" ? "bg-emerald-500" : x.estado === "paused" ? "bg-amber-500" : "bg-muted-foreground/50";
  return (
    <Chip tono={x.estado === "paused" ? "ambar" : x.flex ? "azul" : "gris"} titulo={`${x.mla} · ${ESTADO_DE_PUBLICACION[x.estado]}${x.cuenta ? ` · ${x.cuenta}` : ""}`}>
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
      {x.precio != null && <span className="tabular-nums opacity-80">· {pesos(x.precio)}</span>}
    </Chip>
  );
}

/** Lo que una variante tiene publicado en una cuenta. */
function PublicacionesDe({ comb, de, conDiferencias }: { comb: CombinacionLista | null; de: DeCuenta; conDiferencias?: boolean }) {
  if (!comb) return <span className="text-xs text-muted-foreground">—</span>;
  const pubs = comb.publicaciones.filter((x) => deCuenta(x) === de);
  const difiere = conDiferencias && de === "otra" ? diferenciasDe(comb) : [];
  if (!pubs.length) {
    // En la otra cuenta sólo falta la copia si en la principal está publicada.
    if (de === "otra" && !comb.publicaciones.length) return <span className="text-xs text-muted-foreground">—</span>;
    return <Chip tono="hueco">{de === "otra" ? "Sin copiar" : "Sin publicar"}</Chip>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {pubs.map((x) => (
        <ChipDePublicacion key={x.mla} x={x} />
      ))}
      {difiere.length > 0 && (
        <Chip tono="distinto" titulo={`No está igual que en la otra cuenta: ${difiere.join(", ")}`}>
          ≠ {difiere.join(" · ")}
        </Chip>
      )}
    </div>
  );
}

/** Lo de una cuenta de un producto con varias variantes, en números: sólo las variantes que se ven. */
function ResumenDeCuenta({ f, de, conDiferencias }: { f: Fila; de: DeCuenta; conDiferencias?: boolean }) {
  const combs = f.unidades.map((u) => u.comb).filter((c): c is CombinacionLista => !!c);
  const pubs = combs.flatMap((c) => c.publicaciones.filter((x) => deCuenta(x) === de));
  const n = (si: (x: PublicacionMl) => boolean) => pubs.filter(si).length;
  const activas = n((x) => x.estado === "active");
  const pausadas = n((x) => x.estado === "paused");
  const sinLeer = n((x) => x.estado === "otro");
  const flex = n((x) => x.flex);
  const aPedido = n((x) => x.dias != null);
  const faltan = combs.filter((c) => !c.publicaciones.some((x) => deCuenta(x) === de) && (de === "principal" || c.publicaciones.length > 0)).length;
  const difieren = conDiferencias && de === "otra" ? combs.filter((c) => diferenciasDe(c).length).length : 0;
  if (!pubs.length && !faltan) return <span className="text-xs text-muted-foreground">—</span>;
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
      {faltan > 0 && <Chip tono="hueco">{faltan} {de === "otra" ? "sin copiar" : "sin publicar"}</Chip>}
      {difieren > 0 && (
        <Chip tono="distinto" titulo="Variantes que no están igual en las dos cuentas: abrí el producto para ver cuáles">
          ≠ {difieren} {difieren === 1 ? "difiere" : "difieren"}
        </Chip>
      )}
    </div>
  );
}

function Stock({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="text-muted-foreground">—</span>;
  // Casi todo se hace a pedido: un cero es lo normal, no una alarma.
  return <span className={n > 0 ? "font-semibold" : "text-muted-foreground"}>{n}</span>;
}

function Vendidas({ d30, total }: { d30: number; total: number }) {
  return (
    <>
      {d30 > 0 ? <span className="font-medium">{d30}</span> : <span className="text-muted-foreground">—</span>}
      {total > 0 && <div className="text-[10px] leading-3 text-muted-foreground">{total} en total</div>}
    </>
  );
}

function Foto({ url, nombre, clase }: { url: string | null; nombre: string; clase: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={nombre} loading="lazy" className={`${clase} object-cover`} />
  ) : (
    <div className={`${clase} bg-muted flex items-center justify-center`}>
      <FileBox className="h-1/2 w-1/2 text-muted-foreground/40" />
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
      className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${puesto ? "text-foreground" : ""} ${derecha ? "flex-row-reverse" : ""}`}
      title="Ordenar por esta columna"
    >
      {children}
      {puesto && <Flecha className="h-3 w-3" />}
    </button>
  );
}

/** Las cuentas que tienen columna según lo que se mira. */
const cuentasDe = (a: Alcance): DeCuenta[] => (a === "todas" ? ["principal", "otra"] : [a]);

const COLUMNAS: Record<Alcance, string> = {
  todas: "2rem minmax(15rem,1.7fr) 3.5rem 5.5rem 5.5rem minmax(11rem,1fr) minmax(11rem,1fr) 3rem",
  principal: "2rem minmax(16rem,1.7fr) 4rem 6rem 6rem minmax(14rem,1.4fr) 3rem",
  otra: "2rem minmax(16rem,1.7fr) 4rem 6rem 6rem minmax(14rem,1.4fr) 3rem",
};

function EnLaWeb({ si, parcial }: { si: boolean; parcial?: string }) {
  if (!si) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-foreground" title={parcial ? `En la web: ${parcial}` : "Está en la web"}>
      <Globe className="h-3.5 w-3.5 text-primary" />
      {parcial}
    </span>
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
  alcance,
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
  /** Qué cuenta de ML se mira: con "todas", una columna por cuenta. */
  alcance: Alcance;
}) {
  // Lo que se abrió o cerró a mano gana sobre lo que viene dado.
  const [aMano, setAMano] = useState<Record<string, boolean>>({});
  const [cerrados, setCerrados] = useState<Set<string>>(new Set());
  const unicas = [...new Set(grupos.flatMap((g) => g.filas.flatMap((f) => f.unidades.map((u) => u.clave))))];
  const cuentas = cuentasDe(alcance);
  const dos = alcance === "todas";
  const grilla = { gridTemplateColumns: COLUMNAS[alcance] };
  const fila = "grid items-center gap-x-3 px-3";

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <div className={dos ? "min-w-[62rem]" : "min-w-[52rem]"}>
        <div className={`${fila} h-10 border-b bg-muted/40 text-xs font-medium text-muted-foreground`} style={grilla}>
          <Tilde estado={estadoDeTilde(unicas, elegidos)} onChange={() => onAlternar(unicas)} etiqueta="Elegir todo lo que se ve" />
          <Encabezado columna="nombre" orden={orden} onOrden={onOrden}>
            Producto
          </Encabezado>
          <div className="text-right">
            <Encabezado columna="stock" orden={orden} onOrden={onOrden} derecha>
              Stock
            </Encabezado>
          </div>
          <div className="text-right">
            <Encabezado columna="vendidos" orden={orden} onOrden={onOrden} derecha>
              Vendidos 30 d
            </Encabezado>
          </div>
          <div className="text-right">
            <Encabezado columna="costo" orden={orden} onOrden={onOrden} derecha>
              Costo
            </Encabezado>
          </div>
          {cuentas.map((de) => (
            <EtiquetaDeCuenta key={de} de={de} className={COLOR_DE_CUENTA[de].texto} />
          ))}
          <span>Web</span>
        </div>

        {grupos.map((g) => {
          const clavesDelGrupo = g.filas.flatMap((f) => f.unidades.map((u) => u.clave));
          const cerrado = agrupado && cerrados.has(g.clave);
          const estadoDelGrupo = estadoDeTilde(clavesDelGrupo, elegidos);
          return (
            <section key={g.clave || "todo"}>
              {agrupado && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/60 px-3 py-2">
                  <Tilde estado={estadoDelGrupo} onChange={() => onAlternar(clavesDelGrupo)} etiqueta={`Elegir el grupo ${g.nombre}`} />
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
                    <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${cerrado ? "" : "rotate-90"}`} />
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
              )}
              {!cerrado &&
                g.filas.map((f) => {
                  const { p, c } = f;
                  const conVariantes = f.todas.length > 1;
                  const abierto = conVariantes && (aMano[p.id] ?? (verVariantes || f.parcial));
                  const claves = f.unidades.map((u) => u.clave);
                  const estado = estadoDeTilde(claves, elegidos);
                  const unica = conVariantes ? null : f.unidades[0].comb;
                  const enWeb = f.unidades.filter((u) => u.comb?.web).length;
                  return (
                    <div key={`${g.clave}|${p.id}`} className="border-b last:border-b-0">
                      <div
                        role="link"
                        tabIndex={0}
                        onClick={() => onAbrir(p.id)}
                        onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onAbrir(p.id)}
                        className={`${fila} group cursor-pointer py-2.5 transition-colors duration-150 focus:outline-none focus-visible:bg-muted/60 ${estado !== "ninguna" ? "bg-primary/[0.06] shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/10" : "hover:bg-muted/50"}`}
                        style={grilla}
                      >
                        <span onClick={(e) => e.stopPropagation()}>
                          <Tilde estado={estado} onChange={() => onAlternar(claves)} etiqueta={`Elegir ${p.nombre}`} />
                        </span>
                        <div className="flex min-w-0 items-center gap-3">
                          <Foto url={p.imagenUrl} nombre={p.nombre} clase="h-11 w-11 shrink-0 rounded-lg ring-1 ring-border transition-transform duration-200 group-hover:scale-105" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium leading-tight">{p.nombre}</span>
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
                                <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${abierto ? "rotate-90" : ""}`} />
                                {f.parcial ? `${f.unidades.length} de ${f.todas.length} variantes` : `${f.todas.length} variantes`}
                                {estado === "algunas" && ` · ${claves.filter((k) => elegidos.has(k)).length} elegidas`}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <Stock n={conVariantes ? c?.stock : (unica?.stock ?? c?.stock)} />
                        </div>
                        <div className="text-right tabular-nums">
                          <Vendidas d30={c?.vendidas30 ?? 0} total={c?.vendidas ?? 0} />
                        </div>
                        <div className="text-right tabular-nums text-sm">
                          {pesos((p.costoFab || 0) + (p.costoInsumos || 0))}
                          {p.costoInsumos > 0 && <div className="text-[10px] leading-3 text-muted-foreground">{pesos(p.costoInsumos)} de insumos</div>}
                        </div>
                        {cuentas.map((de) => (
                          <div key={de}>{conVariantes ? <ResumenDeCuenta f={f} de={de} conDiferencias={dos} /> : <PublicacionesDe comb={unica} de={de} conDiferencias={dos} />}</div>
                        ))}
                        <EnLaWeb si={enWeb > 0} parcial={conVariantes && enWeb > 0 && enWeb < f.unidades.length ? `${enWeb}/${f.unidades.length}` : undefined} />
                      </div>
                      <AnimatePresence initial={false}>
                        {abierto && (
                          <motion.div key="variantes" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SUAVE} className="overflow-hidden bg-muted/25">
                            {f.unidades.map((u) => {
                              const comb = u.comb!;
                              const tildada = elegidos.has(u.clave);
                              return (
                                <div
                                  key={u.clave}
                                  onClick={() => onAlternar([u.clave])}
                                  className={`${fila} cursor-pointer border-t border-border/60 py-1.5 text-[13px] transition-colors duration-150 ${tildada ? "bg-primary/[0.06] shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/10" : "hover:bg-muted/50"}`}
                                  style={grilla}
                                >
                                  <span onClick={(e) => e.stopPropagation()}>
                                    <Tilde estado={tildada ? "todas" : "ninguna"} onChange={() => onAlternar([u.clave])} etiqueta={`Elegir ${comb.nombre}`} />
                                  </span>
                                  <span className="ml-[3.5rem] truncate border-l-2 border-border pl-3" title={comb.nombre}>
                                    {comb.corto}
                                  </span>
                                  <div className="text-right tabular-nums">
                                    <Stock n={comb.stock} />
                                  </div>
                                  <div className="text-right tabular-nums">
                                    <Vendidas d30={comb.vendidas30} total={comb.vendidas} />
                                  </div>
                                  <span />
                                  {cuentas.map((de) => (
                                    <div key={de}>
                                      <PublicacionesDe comb={comb} de={de} conDiferencias={dos} />
                                    </div>
                                  ))}
                                  <EnLaWeb si={comb.web} />
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Las tarjetas: en el teléfono, y como vista alternativa. Tildar una elige el producto entero. */
export function TarjetasDeProductos({
  grupos,
  agrupado,
  elegidos,
  onAlternar,
  onAbrir,
  alcance,
}: {
  grupos: Grupo[];
  agrupado: boolean;
  elegidos: ReadonlySet<string>;
  onAlternar: (claves: string[]) => void;
  onAbrir: (id: string) => void;
  alcance: Alcance;
}) {
  const cuentas = cuentasDe(alcance);
  const dos = alcance === "todas";
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
                  <motion.article
                    key={p.id}
                    whileHover={{ y: -3 }}
                    transition={SUAVE}
                    onClick={() => onAbrir(p.id)}
                    className={`group cursor-pointer overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-lg ${estado !== "ninguna" ? "ring-2 ring-primary/60" : ""}`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      <Foto url={p.imagenUrl} nombre={p.nombre} clase="h-full w-full transition-transform duration-300 group-hover:scale-105" />
                      <span className="absolute top-2 left-2 rounded-md bg-background/90 p-1 leading-none shadow-sm" onClick={(e) => e.stopPropagation()}>
                        <Tilde estado={estado} onChange={() => onAlternar(claves)} etiqueta={`Elegir ${p.nombre}`} />
                      </span>
                      {!p.activo && (
                        <Badge variant="destructive" className="absolute top-2 right-2">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <div>
                        <h3 className="font-semibold truncate" title={p.nombre}>
                          {p.nombre}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate">
                          {[p.serie, f.todas.length > 1 ? `${f.todas.length} variantes` : null, `stock ${c?.stock ?? "—"}`, c?.vendidas30 ? vendidosEn30(c.vendidas30) : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {cuentas.map((de) => (
                        <div key={de} className="flex items-start gap-2">
                          {dos && <PuntoDeCuenta de={de} className="mt-1.5" />}
                          <ResumenDeCuenta f={f} de={de} conDiferencias={dos} />
                        </div>
                      ))}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
