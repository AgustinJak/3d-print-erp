"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, Search, SlidersHorizontal, TableIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FILTROS_INICIALES, type Agrupar, type Alcance, type CategoriaLista, type Filtros, type Orden } from "@/lib/productos-lista";

/**
 * La barra de Productos (docs/sdd/008): buscar, agrupar, ordenar y filtrar. Cada filtro es una
 * píldora que se pinta cuando está puesto, para ver de un vistazo qué está recortando la lista.
 */

export type Vista = "tabla" | "tarjetas";

const ORDENES: Array<[Orden, string]> = [
  ["nuevo", "Más reciente"],
  ["antiguo", "Más antiguo"],
  ["az", "Nombre A → Z"],
  ["za", "Nombre Z → A"],
  ["vendidos30", "Más vendidos (30 días)"],
  ["menos_vendidos30", "Menos vendidos (30 días)"],
  ["vendidos", "Más vendidos (siempre)"],
  ["stock_mas", "Más stock"],
  ["stock_menos", "Menos stock"],
  ["costo_mas", "Mayor costo"],
  ["costo_menos", "Menor costo"],
];

const claseDePildora = (puesto: boolean) =>
  `inline-flex items-center gap-1 rounded-full border h-8 text-xs transition-all duration-150 active:scale-[0.97] ${
    puesto ? "border-primary/60 bg-primary/10 text-foreground" : "border-input bg-background text-muted-foreground hover:bg-muted/60"
  }`;

/** Un filtro de una sola opción: la etiqueta y, al lado, lo elegido. */
function Pildora<T extends string>({ etiqueta, valor, opciones, neutro, onChange }: { etiqueta: string; valor: T; opciones: ReadonlyArray<readonly [T, string]>; neutro: T; onChange: (v: T) => void }) {
  return (
    <label className={`${claseDePildora(valor !== neutro)} pl-3 pr-1 cursor-pointer`}>
      <span>{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={etiqueta}
        className="h-7 rounded-full bg-transparent pl-0.5 pr-1 font-medium text-foreground cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {opciones.map(([v, t]) => (
          <option key={v} value={v} className="bg-popover text-popover-foreground">
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

function Interruptor({ puesto, onChange, children, titulo }: { puesto: boolean; onChange: () => void; children: React.ReactNode; titulo?: string }) {
  return (
    <button type="button" onClick={onChange} aria-pressed={puesto} title={titulo} className={`${claseDePildora(puesto)} px-3`}>
      {children}
    </button>
  );
}

function PildoraDeCategorias({ categorias, elegidas, onChange }: { categorias: CategoriaLista[]; elegidas: string[]; onChange: (ids: string[]) => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const afuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", afuera);
    return () => document.removeEventListener("mousedown", afuera);
  }, []);
  const una = elegidas.length === 1 ? categorias.find((c) => c.id === elegidas[0])?.nombre : null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className={`${claseDePildora(elegidas.length > 0)} pl-3 pr-2`}>
        <span>Categoría</span>
        <span className="font-medium text-foreground">{elegidas.length === 0 ? "Todas" : (una ?? `${elegidas.length} elegidas`)}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {abierto && (
        <div className="absolute z-50 mt-1 w-60 max-h-80 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {categorias.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin categorías</p>}
          {categorias.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={elegidas.includes(c.id)}
                onChange={() => onChange(elegidas.includes(c.id) ? elegidas.filter((x) => x !== c.id) : [...elegidas, c.id])}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              {c.color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
              {c.nombre}
            </label>
          ))}
          {elegidas.length > 0 && (
            <button type="button" className="mt-1 w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted" onClick={() => onChange([])}>
              Todas las categorías
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Cuántos filtros están recortando la lista (sin contar el estado, que siempre tiene uno). */
export function filtrosPuestos(f: Filtros): number {
  return (
    (f.texto.trim() ? 1 : 0) +
    (f.categorias.length ? 1 : 0) +
    (["sku", "ml", "web", "stock", "entrega"] as const).filter((k) => f[k] !== FILTROS_INICIALES[k]).length +
    (["con3mf", "conImagen", "conVariantes", "difieren"] as const).filter((k) => f[k]).length
  );
}

export function FiltrosDeProductos({
  f,
  onFiltros,
  categorias,
  orden,
  onOrden,
  agrupar,
  onAgrupar,
  vista,
  onVista,
  consolidados,
  onConsolidados,
  sku,
  alcance,
  otraCuenta,
}: {
  f: Filtros;
  onFiltros: (cambio: Partial<Filtros>) => void;
  categorias: CategoriaLista[];
  orden: Orden;
  onOrden: (o: Orden) => void;
  agrupar: Agrupar;
  onAgrupar: (a: Agrupar) => void;
  vista: Vista;
  onVista: (v: Vista) => void;
  consolidados: boolean;
  onConsolidados: (v: boolean) => void;
  sku: { con: number; total: number };
  /** Qué cuenta de ML se mira: los filtros de ML y de entrega miran ésa. */
  alcance: Alcance;
  /** El nombre de la otra cuenta, si hay. */
  otraCuenta: string | null;
}) {
  const deMas = (f.sku !== "todos" ? 1 : 0) + (f.con3mf ? 1 : 0) + (f.conImagen ? 1 : 0) + (f.conVariantes ? 1 : 0) + (consolidados ? 1 : 0);
  const [masFiltros, setMasFiltros] = useState(deMas > 0);
  const puestos = filtrosPuestos(f);
  const sinSku = sku.total - sku.con;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, serie o SKU…" value={f.texto} onChange={(e) => onFiltros({ texto: e.target.value })} className="pl-9 pr-8" />
          {f.texto && (
            <button type="button" aria-label="Borrar la búsqueda" onClick={() => onFiltros({ texto: "" })} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="inline-flex rounded-md border text-sm overflow-hidden">
          {(["activos", "inactivos", "todos", "insumos"] as const).map((e, i) => (
            <button
              key={e}
              type="button"
              onClick={() => onFiltros({ estado: e })}
              aria-pressed={f.estado === e}
              className={`px-3 h-9 capitalize transition-colors ${f.estado === e ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"} ${i > 0 ? "border-l" : ""}`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md border ml-auto">
          <Button variant={vista === "tabla" ? "default" : "ghost"} size="icon" className="rounded-r-none h-9 w-9" onClick={() => onVista("tabla")} title="Vista de tabla" aria-label="Vista de tabla">
            <TableIcon className="h-4 w-4" />
          </Button>
          <Button variant={vista === "tarjetas" ? "default" : "ghost"} size="icon" className="rounded-l-none h-9 w-9" onClick={() => onVista("tarjetas")} title="Vista de tarjetas" aria-label="Vista de tarjetas">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <PildoraDeCategorias categorias={categorias} elegidas={f.categorias} onChange={(ids) => onFiltros({ categorias: ids })} />
        <Pildora
          etiqueta="Mercado Libre"
          valor={f.ml}
          neutro="todos"
          onChange={(ml) => onFiltros({ ml })}
          opciones={[["todos", "Todos"], ["publicados", "Publicados"], ["pausados", "Pausados"], ["sin", alcance === "otra" ? "Sin copiar" : "Sin publicar"]]}
        />
        <Pildora
          etiqueta="Entrega"
          valor={f.entrega}
          neutro="todas"
          onChange={(entrega) => onFiltros({ entrega })}
          opciones={[["todas", "Todas"], ["flex", "Con Flex"], ["a_pedido", "A pedido"], ["ninguna", "Sin Flex ni días"]]}
        />
        {alcance === "todas" && otraCuenta && (
          <Interruptor puesto={f.difieren} onChange={() => onFiltros({ difieren: !f.difieren })} titulo={`Las variantes que no tienen el mismo Flex, los mismos días o el mismo precio en ${otraCuenta}`}>
            <span aria-hidden>≠</span> Difieren entre cuentas
          </Interruptor>
        )}
        <Pildora etiqueta="Stock" valor={f.stock} neutro="todos" onChange={(stock) => onFiltros({ stock })} opciones={[["todos", "Todos"], ["con", "Con stock"], ["sin", "Sin stock"]]} />
        <Pildora etiqueta="Web" valor={f.web} neutro="todos" onChange={(web) => onFiltros({ web })} opciones={[["todos", "Todos"], ["si", "En la web"], ["no", "No está"]]} />
        <Interruptor puesto={masFiltros || deMas > 0} onChange={() => setMasFiltros(!masFiltros)}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Más{deMas > 0 ? ` (${deMas})` : ""}
        </Interruptor>
        {puestos > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onFiltros({ ...FILTROS_INICIALES, estado: f.estado })}
          >
            <X className="h-3.5 w-3.5" /> Sacar filtros
          </button>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <Pildora etiqueta="Agrupar" valor={agrupar} neutro="nada" onChange={onAgrupar} opciones={[["nada", "No"], ["serie", "Por serie"], ["categoria", "Por categoría"]]} />
          <Pildora etiqueta="Orden" valor={orden} neutro="nuevo" onChange={onOrden} opciones={ORDENES} />
        </div>
      </div>

      {masFiltros && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Pildora etiqueta="SKU" valor={f.sku} neutro="todos" onChange={(v) => onFiltros({ sku: v })} opciones={[["todos", "Todos"], ["con", "Con SKU"], ["sin", "Sin SKU"]]} />
          <Interruptor puesto={f.conVariantes} onChange={() => onFiltros({ conVariantes: !f.conVariantes })}>
            Con variantes
          </Interruptor>
          <Interruptor puesto={f.conImagen} onChange={() => onFiltros({ conImagen: !f.conImagen })}>
            Con imagen
          </Interruptor>
          <Interruptor puesto={f.con3mf} onChange={() => onFiltros({ con3mf: !f.con3mf })}>
            Con archivo 3MF
          </Interruptor>
          <Interruptor puesto={consolidados} onChange={() => onConsolidados(!consolidados)} titulo="Los productos que se consolidaron en otro">
            Mostrar consolidados
          </Interruptor>
          <button
            type="button"
            onClick={() => onFiltros({ sku: sinSku > 0 ? "sin" : "todos" })}
            className={`ml-1 text-xs hover:underline decoration-dotted underline-offset-4 ${sinSku > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
            title={sinSku > 0 ? "Ver los que faltan" : "Todos los productos tienen SKU"}
          >
            {sku.con}/{sku.total} con SKU
          </button>
        </div>
      )}
    </div>
  );
}
