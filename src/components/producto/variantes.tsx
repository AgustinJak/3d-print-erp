"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { json, pedir, pesos, Seccion } from "@/components/producto/seccion";
import type { FilaDeFicha, Ficha, OpcionDeFicha } from "@/app/api/modelos/[id]/ficha/route";
import type { PiezaDeBodega } from "@/app/api/bodega/piezas/route";
import type { Insumo } from "@/lib/recetas";

type Tipo = "pieza" | "insumo" | "decoracion";
type Grupo = Ficha["grupos"][number];

/** Lo que es cada tipo de grupo, en palabras (spec 003). */
export const TIPOS: Record<Tipo, { nombre: string; ayuda: string; ejemplo: string }> = {
  pieza: { nombre: "Otra pieza", ayuda: "cada opción se imprime aparte y tiene su stock", ejemplo: "colores de la Bola de JOJOS, diseños de la jabonera" },
  insumo: { nombre: "Insumo", ayuda: "“Con” descuenta un insumo; “Sin”, no", ejemplo: "la funda de una katana" },
  decoracion: { nombre: "Solo decoración", ayuda: "la misma pieza para todas las opciones", ejemplo: "las firmas del vaso BTS" },
};

const selectClase =
  "h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

const lineas = (s: string) => s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);

/* ─────────────────────────── pieza de Bodega de una fila ─────────────────────────── */

/**
 * El selector de pieza de Bodega de una fila de stock (spec 003, REQ-5 y RN-4/RN-6): primero las
 * sueltas, después las enganchadas a otra fila (elegir una la libera de esa).
 */
function SelectorPieza({ fila, piezas, onCambio }: { fila: FilaDeFicha; piezas: PiezaDeBodega[] | null; onCambio: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const actual = fila.pieza?.id ?? "";
  const sinSubir = !!fila.pieza && !fila.pieza.nombre;

  async function elegir(bodegaModelId: string) {
    if (bodegaModelId === actual) return;
    const otra = piezas?.find((p) => p.id === bodegaModelId)?.fila;
    if (otra && !confirm(`Esa pieza está enganchada a "${otra.etiqueta ?? otra.modelo}". ¿Pasarla a esta fila? La otra queda sin pieza.`)) return;
    setGuardando(true);
    try {
      const r = await pedir<{ liberado: string | null }>(`/api/stock/${fila.id}/bodega`, json("PUT", { bodegaModelId: bodegaModelId || null }));
      toast.success(r.liberado ? `Listo. "${r.liberado}" quedó sin pieza.` : bodegaModelId ? "Pieza enganchada" : "Pieza quitada");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo enganchar");
    } finally {
      setGuardando(false);
    }
  }

  if (piezas === null) return <span className="text-xs text-muted-foreground">Cargando piezas…</span>;
  const sueltas = piezas.filter((p) => !p.fila || p.fila.id === fila.id);
  const enganchadas = piezas.filter((p) => p.fila && p.fila.id !== fila.id);
  const costo = (p: PiezaDeBodega) => (p.costo != null ? ` · ${pesos(p.costo)}` : " · sin costear");

  return (
    <select className={selectClase} value={actual} disabled={guardando} onChange={(e) => elegir(e.target.value)} aria-label="Pieza de Bodega">
      <option value="">— sin pieza de Bodega —</option>
      {sinSubir && <option value={actual}>Pieza creada sin archivo (Bodega todavía no la subió)</option>}
      <optgroup label="Sueltas">
        {sueltas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
            {costo(p)}
          </option>
        ))}
      </optgroup>
      {enganchadas.length > 0 && (
        <optgroup label="Enganchadas a otra fila">
          {enganchadas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} (en {p.fila!.etiqueta ?? p.fila!.modelo})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/* ─────────────────────────────── una opción ─────────────────────────────── */

function FilaOpcion({
  ficha,
  grupo,
  opcion,
  piezas,
  insumos,
  onCambio,
}: {
  ficha: Ficha;
  grupo: Grupo;
  opcion: OpcionDeFicha;
  piezas: PiezaDeBodega[] | null;
  insumos: Insumo[];
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [v, setV] = useState({ nombre: opcion.nombre, precioAdicional: String(opcion.precioAdicional || "") });
  const base = `/api/modelos/${ficha.producto.id}/variantes/${opcion.id}`;
  const esCon = grupo.tipo === "insumo" && /^\s*con\s+/i.test(opcion.nombre);
  const combinacion = ficha.combinaciones.find((c) => c.variantes.length === 1 && c.variantes[0] === opcion.id);

  async function guardar() {
    setGuardando(true);
    try {
      await pedir(base, json("PATCH", { ...(grupo.tipo !== "insumo" ? { nombre: v.nombre } : {}), precioAdicional: Number(v.precioAdicional.replace(/\./g, "").replace(",", ".")) || 0 }));
      toast.success("Opción guardada");
      setEditando(false);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!confirm(`¿Borrar "${opcion.nombre}"? Lo que se vendía con esa opción queda desactivado.`)) return;
    try {
      const r = await pedir<{ filasQueQuedan: number }>(base, { method: "DELETE" });
      toast.success(r.filasQueQuedan ? `Borrada. Su fila de stock queda (tiene stock o pieza).` : "Borrada");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  async function elegirInsumo(stockId: string) {
    if (!combinacion) return toast.error("No encontré la combinación de esta opción");
    try {
      await pedir(`/api/combinaciones/${combinacion.id}/receta`, json("PUT", { insumos: stockId ? [{ stockId, cantidad: 1 }] : [] }));
      toast.success(stockId ? "Insumo elegido" : "Insumo quitado");
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  if (editando) {
    return (
      <div className="rounded-md border border-dashed p-2.5 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
          {grupo.tipo !== "insumo" ? (
            <Input value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} aria-label="Nombre de la opción" />
          ) : (
            <p className="text-sm self-center">{opcion.nombre}</p>
          )}
          <Input
            inputMode="decimal"
            placeholder="+$ venta"
            value={v.precioAdicional}
            onChange={(e) => setV({ ...v, precioAdicional: e.target.value })}
            aria-label="Precio adicional"
          />
        </div>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={guardar} disabled={guardando}>
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{opcion.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {opcion.fila && <>stock {opcion.fila.cantidad} · </>}
            {opcion.precioAdicional > 0 ? `+${pesos(opcion.precioAdicional)} venta` : "sin recargo"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditando(true)} title="Editar" aria-label={`Editar ${opcion.nombre}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {grupo.tipo !== "insumo" && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={borrar} title="Borrar" aria-label={`Borrar ${opcion.nombre}`}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>
      {grupo.tipo === "pieza" &&
        (opcion.fila ? (
          <SelectorPieza fila={opcion.fila} piezas={piezas} onCambio={onCambio} />
        ) : (
          <p className="text-xs text-amber-600">Sin fila de stock: guardá la opción de nuevo para crearla.</p>
        ))}
      {esCon && (
        <div className="space-y-1">
          <select className={selectClase} value={opcion.insumo?.stockId ?? ""} onChange={(e) => elegirInsumo(e.target.value)} aria-label="Insumo que descuenta">
            <option value="">— elegí qué descuenta —</option>
            {insumos.map((i) => (
              <option key={i.stockId} value={i.stockId}>
                {i.etiqueta} · usada por {i.usadoPor.length} · stock {i.cantidad}
                {i.costo != null ? ` · ${pesos(i.costo)}` : ""}
              </option>
            ))}
          </select>
          {!opcion.insumo && (
            <p className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" /> Falta elegir el insumo: hasta entonces no se descuenta nada.
            </p>
          )}
        </div>
      )}
      {grupo.tipo === "insumo" && !esCon && <p className="text-xs text-muted-foreground">No descuenta ningún insumo.</p>}
    </div>
  );
}

/* ─────────────────────────────── un grupo ─────────────────────────────── */

function BloqueGrupo(props: { ficha: Ficha; grupo: Grupo; piezas: PiezaDeBodega[] | null; insumos: Insumo[]; onCambio: () => void }) {
  const { ficha, grupo, onCambio } = props;
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const url = `/api/modelos/${ficha.producto.id}`;

  async function hacer(f: () => Promise<unknown>, aviso: string) {
    setOcupado(true);
    try {
      await f();
      toast.success(aviso);
      onCambio();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const otroTipo: Tipo | null = grupo.tipo === "pieza" ? "decoracion" : grupo.tipo === "decoracion" ? "pieza" : null;
  const hayOtroDePiezas = ficha.grupos.some((g) => g !== grupo && g.tipo === "pieza");

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renombrando !== null ? (
          <div className="flex items-center gap-1.5">
            <Input value={renombrando} onChange={(e) => setRenombrando(e.target.value)} className="h-8 w-44" aria-label="Nombre del grupo" />
            <Button
              size="sm"
              disabled={ocupado || !renombrando.trim()}
              onClick={async () => {
                if (await hacer(() => pedir(`${url}/grupos`, json("PATCH", { grupo: grupo.nombre, nombre: renombrando })), "Grupo renombrado")) setRenombrando(null);
              }}
            >
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRenombrando(null)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-medium">{grupo.nombre}</p>
            <Badge variant="secondary" title={TIPOS[grupo.tipo].ayuda}>
              {TIPOS[grupo.tipo].nombre}
            </Badge>
          </div>
        )}
        {renombrando === null && (
          <div className="flex flex-wrap items-center gap-1">
            {grupo.tipo !== "insumo" && agregando === null && (
              <Button size="sm" variant="outline" onClick={() => setAgregando("")}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Opciones
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setRenombrando(grupo.nombre)}>
              Renombrar
            </Button>
            {otroTipo && !(otroTipo === "pieza" && hayOtroDePiezas) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={ocupado}
                onClick={() => {
                  const aviso =
                    otroTipo === "decoracion"
                      ? `¿Pasar "${grupo.nombre}" a solo decoración? Sus opciones dejan de tener stock propio: las filas vacías se borran y las que tienen stock o pieza quedan.`
                      : `¿Pasar "${grupo.nombre}" a otra pieza? Cada opción va a tener su fila de stock.`;
                  if (confirm(aviso)) hacer(() => pedir(`${url}/grupos`, json("PATCH", { grupo: grupo.nombre, tipo: otroTipo })), "Tipo cambiado");
                }}
              >
                Pasar a {TIPOS[otroTipo].nombre.toLowerCase()}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={ocupado}
              title="Borrar el grupo"
              aria-label={`Borrar el grupo ${grupo.nombre}`}
              onClick={() => {
                if (confirm(`¿Borrar el grupo "${grupo.nombre}" con sus ${grupo.opciones.length} opciones?`)) {
                  hacer(() => pedir(`${url}/grupos?grupo=${encodeURIComponent(grupo.nombre)}`, { method: "DELETE" }), "Grupo borrado");
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </div>

      {agregando !== null && (
        <div className="rounded-md border border-dashed p-2.5 space-y-2">
          <Textarea rows={3} value={agregando} onChange={(e) => setAgregando(e.target.value)} placeholder="Una por renglón" aria-label="Opciones nuevas" />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAgregando(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={ocupado || lineas(agregando).length === 0}
              onClick={async () => {
                if (await hacer(() => pedir(`${url}/variantes`, json("POST", { grupo: grupo.nombre, nombres: lineas(agregando) })), "Opciones agregadas")) setAgregando(null);
              }}
            >
              Agregar {lineas(agregando).length || ""}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {grupo.opciones.map((o) => (
          <FilaOpcion key={o.id} {...props} opcion={o} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── grupo nuevo ─────────────────────────────── */

function NuevoGrupo({ ficha, insumos, onCambio, onCerrar }: { ficha: Ficha; insumos: Insumo[]; onCambio: () => void; onCerrar: () => void }) {
  const ocupados = new Set(ficha.grupos.map((g) => g.tipo));
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [nombre, setNombre] = useState("");
  const [opciones, setOpciones] = useState("");
  const [insumo, setInsumo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const permitido = (t: Tipo) => t === "decoracion" || !ocupados.has(t);
  const listo = !!tipo && !!nombre.trim() && (tipo === "insumo" || lineas(opciones).length > 0);

  async function crear() {
    if (!tipo) return;
    setGuardando(true);
    try {
      await pedir(`/api/modelos/${ficha.producto.id}/grupos`, json("POST", { nombre, tipo, opciones: lineas(opciones), insumoStockId: insumo || null }));
      toast.success(tipo === "insumo" ? `Listo: "Con ${nombre}" y "Sin ${nombre}"` : "Grupo creado");
      onCambio();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3 space-y-3">
      <p className="text-sm font-medium">¿Qué es este grupo?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(Object.keys(TIPOS) as Tipo[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={!permitido(t)}
            onClick={() => {
              setTipo(t);
              if (!nombre) setNombre(t === "insumo" ? "Funda" : t === "pieza" ? "Color" : "");
            }}
            className={`rounded-md border p-2.5 text-left text-sm transition-colors disabled:opacity-40 ${tipo === t ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
          >
            <p className="font-medium">{TIPOS[t].nombre}</p>
            <p className="text-xs text-muted-foreground">{TIPOS[t].ayuda}</p>
            <p className="text-xs text-muted-foreground mt-1">Ej.: {TIPOS[t].ejemplo}</p>
            {!permitido(t) && <p className="text-xs text-amber-600 mt-1">Ya tiene uno: un producto lleva uno solo.</p>}
          </button>
        ))}
      </div>

      {tipo && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="g-nombre">{tipo === "insumo" ? "Nombre del accesorio" : "Nombre del grupo"}</Label>
            <Input id="g-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tipo === "insumo" ? "Funda, Exhibidor…" : "Color, Diseño, Firma…"} className="max-w-xs" />
          </div>
          {tipo === "insumo" ? (
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="g-insumo">Qué descuenta &quot;Con {nombre || "…"}&quot;</Label>
              <select id="g-insumo" className={selectClase} value={insumo} onChange={(e) => setInsumo(e.target.value)}>
                <option value="">— lo elijo después —</option>
                {insumos.map((i) => (
                  <option key={i.stockId} value={i.stockId}>
                    {i.etiqueta} · usada por {i.usadoPor.length}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">¿Una funda propia que no está? Creala en Bodega en la categoría Insumos y aparece acá.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="g-opciones">Opciones, una por renglón</Label>
              <Textarea id="g-opciones" rows={4} value={opciones} onChange={(e) => setOpciones(e.target.value)} placeholder={"Verde común\nVerde metalizado"} />
              {tipo === "pieza" && (
                <p className="text-xs text-muted-foreground">
                  Cada opción va a tener su fila de stock. En Bodega, nombrá cada pieza &quot;{ficha.producto.nombre} · Opción&quot; y se engancha sola; si no, elegila acá después.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button size="sm" disabled={!listo || guardando} onClick={crear}>
          Crear grupo
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── la sección ─────────────────────────────── */

/** Variantes y piezas (spec 003): los grupos, la pieza de cada opción y el insumo de "Con X". */
export function SeccionVariantes({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const [piezas, setPiezas] = useState<PiezaDeBodega[] | null>(null);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [nuevo, setNuevo] = useState(false);

  const cargarListas = useCallback(() => {
    // Bodega es de un solo negocio: para la cuenta demo, la lista viene vacía o con error.
    pedir<PiezaDeBodega[]>("/api/bodega/piezas").then(setPiezas).catch(() => setPiezas([]));
    pedir<Insumo[]>("/api/insumos").then(setInsumos).catch(() => setInsumos([]));
  }, []);
  useEffect(() => {
    cargarListas();
  }, [cargarListas]);

  const cambio = () => {
    onCambio();
    cargarListas();
  };
  const tienePiezas = ficha.grupos.some((g) => g.tipo === "pieza");

  return (
    <Seccion
      titulo="Variantes y piezas"
      icono={Layers}
      acciones={
        !nuevo && !ficha.producto.esInsumo ? (
          <Button size="sm" variant="outline" onClick={() => setNuevo(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar grupo
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {!tienePiezas && ficha.fila && (
          <div className="rounded-lg border p-3 space-y-1.5">
            <p className="text-sm font-medium">
              Pieza de Bodega <span className="text-xs text-muted-foreground font-normal">· stock {ficha.fila.cantidad}</span>
            </p>
            <SelectorPieza fila={ficha.fila} piezas={piezas} onCambio={cambio} />
          </div>
        )}

        {ficha.grupos.map((g) => (
          <BloqueGrupo key={g.nombre} ficha={ficha} grupo={g} piezas={piezas} insumos={insumos} onCambio={cambio} />
        ))}

        {ficha.grupos.length === 0 && !nuevo && (
          <p className="text-sm text-muted-foreground">
            Sin variantes. Si se vende en colores o diseños, o con funda, agregá un grupo.
          </p>
        )}

        {nuevo && <NuevoGrupo ficha={ficha} insumos={insumos} onCambio={cambio} onCerrar={() => setNuevo(false)} />}

        {ficha.filasSobrantes.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Filas de stock que ya no se venden
            </p>
            <p className="text-xs text-muted-foreground">
              Quedaron con stock o con pieza de Bodega cuando cambiaron las variantes. Movelo desde Stock o quitales la pieza.
            </p>
            {ficha.filasSobrantes.map((f) => (
              <p key={f.id} className="text-sm">
                {f.etiqueta} · stock {f.cantidad}
                {f.pieza ? ` · pieza ${f.pieza.nombre ?? "sin subir"}` : ""}
              </p>
            ))}
          </div>
        )}
      </div>
    </Seccion>
  );
}
