"use client";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { AlertTriangle, Bike, Mail, Package, Store, Zap } from "lucide-react";
import { PuntoDeCuenta, useCuentaActiva } from "@/components/cuenta-activa";
import { nombreConVariantes } from "@/lib/items";

/**
 * Pedidos como tablero por etapa (docs/sdd/011, con la guía de unslop): cada columna es un momento
 * del pedido, de pagar a cobrar. Las tarjetas muestran la foto del producto, el cliente, qué lleva y
 * cuándo hay que despacharlo. Arrastrar una tarjeta a otra columna cambia su estado, igual que el
 * menú de estado de la lista.
 */

interface ItemDelTablero {
  id: string;
  cantidad: number;
  precioUnitario: number;
  ajusteManual: number;
  descripcion?: string | null;
  variantesInfo: Array<{ nombre: string }> | null;
  modelo: { id: string; nombre: string; imagenUrl: string | null } | null;
}

export interface PedidoDelTablero {
  id: string;
  estado: string;
  prioridad: string;
  fechaEntrega: string | null;
  /** Cuándo libera la plata ML: en "Esperando cobro" es la fecha que importa. */
  fechaLiquidacionMl?: string | null;
  canalVenta: string;
  /** "syb" (moto), "correo_argentino", "retiro"; en las ventas directas, texto libre. */
  metodoEnvio?: string | null;
  etiquetas: string[];
  precioEnvio: number;
  cliente: { nombre: string } | null;
  items: ItemDelTablero[];
}

/** Las etapas, en orden. `estado` es al que pasa una tarjeta que se suelta en la columna. */
const ETAPAS: Array<{ clave: string; titulo: string; estados: string[]; estado: string }> = [
  { clave: "pagar", titulo: "A pagar", estados: ["PENDIENTE_PAGO"], estado: "PENDIENTE_PAGO" },
  { clave: "hacer", titulo: "Por hacer", estados: ["CONFIRMADO"], estado: "CONFIRMADO" },
  { clave: "produccion", titulo: "En producción", estados: ["EN_PRODUCCION"], estado: "EN_PRODUCCION" },
  { clave: "listo", titulo: "Listo para despachar", estados: ["TERMINADO", "ENTREGADO"], estado: "TERMINADO" },
  { clave: "cobro", titulo: "Esperando cobro de ML", estados: ["ESPERANDO_LIQUIDACION_ML"], estado: "ESPERANDO_LIQUIDACION_ML" },
  { clave: "reclamo", titulo: "Reclamos", estados: ["RECLAMO_ABIERTO"], estado: "RECLAMO_ABIERTO" },
];

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const totalDe = (p: PedidoDelTablero) => p.items.reduce((s, i) => s + i.precioUnitario * i.cantidad + i.ajusteManual, 0) + p.precioEnvio;
const CANAL: Record<string, string> = { mercadolibre: "ML", shop: "Web" };

/**
 * Cómo sale un pedido que no es de ML: moto (SyB), correo o retiro. La web manda "syb",
 * "correo_argentino" o "retiro"; las ventas directas lo guardan escrito ("Correo Argentino").
 */
function envioDe(p: PedidoDelTablero): { texto: string; Icono: typeof Bike } | null {
  if (p.canalVenta === "mercadolibre") return null;
  const m = (p.metodoEnvio ?? "").toLowerCase();
  if (!m) return null;
  if (m === "syb" || m.includes("moto") || m.includes("mensaj")) return { texto: "Moto", Icono: Bike };
  if (m.includes("correo")) return { texto: "Correo", Icono: Mail };
  if (m.includes("retiro")) return { texto: "Retiro", Icono: Store };
  return null;
}

function cuando(fecha: string | null): { texto: string; tarde: boolean; pronto: boolean } | null {
  if (!fecha) return null;
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dia(new Date(fecha)) - dia(new Date())) / 864e5);
  if (diff < 0) return { texto: `Hace ${-diff} d`, tarde: true, pronto: false };
  if (diff === 0) return { texto: "Hoy", tarde: false, pronto: true };
  if (diff === 1) return { texto: "Mañana", tarde: false, pronto: true };
  return { texto: new Date(fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short" }), tarde: false, pronto: false };
}

/** Cuándo se cobra: "Cobra 24 nov", "Cobra hoy", o "Sin fecha de cobro" (para revisar). */
function cobro(fecha: string | null): { texto: string; tarde: boolean; pronto: boolean } {
  if (!fecha) return { texto: "Sin fecha de cobro", tarde: true, pronto: false };
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((dia(new Date(fecha)) - dia(new Date())) / 864e5);
  if (diff < 0) return { texto: `Cobro vencido hace ${-diff} d`, tarde: true, pronto: false };
  if (diff === 0) return { texto: "Cobra hoy", tarde: false, pronto: true };
  return { texto: `Cobra ${new Date(fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`, tarde: false, pronto: false };
}

function Tarjeta({ p, arrastrando, onAbrir }: { p: PedidoDelTablero; arrastrando: boolean; onAbrir: () => void }) {
  const { alcance, cuentas } = useCuentaActiva();
  const foto = p.items.find((i) => i.modelo?.imagenUrl)?.modelo?.imagenUrl ?? null;
  // Esperando el cobro, lo que importa es cuándo entra la plata, no cuándo se despachó.
  const esperandoCobro = p.estado === "ESPERANDO_LIQUIDACION_ML";
  const fecha = esperandoCobro ? cobro(p.fechaLiquidacionMl ?? null) : cuando(p.fechaEntrega);
  const deCuenta = p.canalVenta === "mercadolibre" ? (cuentas.otra && p.etiquetas.includes(cuentas.otra) ? "otra" : "principal") : null;
  const piezas = p.items.reduce((s, i) => s + i.cantidad, 0);
  const envio = envioDe(p);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => e.key === "Enter" && onAbrir()}
      className={`group rounded-xl border bg-card p-3 text-left transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        arrastrando ? "shadow-[0_8px_24px_rgba(0,0,0,0.12)]" : ""
      } ${p.prioridad === "URGENTE" ? "border-red-500/40" : ""}`}
    >
      <div className="flex gap-3">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-border" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Package className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.5} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {deCuenta && alcance === "todas" && cuentas.otra && <PuntoDeCuenta de={deCuenta} />}
            <span className="truncate">{p.cliente?.nombre ?? "Sin cliente"}</span>
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">
            {p.items.map((i) => `${i.cantidad > 1 ? `${i.cantidad}× ` : ""}${nombreConVariantes(i)}`).join(", ")}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="font-mono">{CANAL[p.canalVenta] ?? "Directa"}</span>
          {p.etiquetas.includes("flex") && (
            <span className="inline-flex items-center gap-0.5">
              · <Zap className="h-3 w-3" strokeWidth={1.5} /> Flex
            </span>
          )}
          {envio && (
            <span className="inline-flex items-center gap-0.5">
              · <envio.Icono className="h-3 w-3" strokeWidth={1.5} /> {envio.texto}
            </span>
          )}
          {p.etiquetas.includes("revision_manual") && (
            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400" title="Revisar a mano">
              · <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
            </span>
          )}
          <span>· {piezas} {piezas === 1 ? "pieza" : "piezas"}</span>
        </span>
        <span className="flex items-center gap-2">
          {fecha && <span className={`font-mono ${fecha.tarde ? "text-red-600 dark:text-red-400" : fecha.pronto ? "text-foreground" : "text-muted-foreground"}`}>{fecha.texto}</span>}
          <span className="font-mono tabular-nums text-foreground">{money(totalDe(p))}</span>
        </span>
      </div>
    </div>
  );
}

export function TableroDePedidos({ pedidos, onEstado, onAbrir }: { pedidos: PedidoDelTablero[]; onEstado: (id: string, estado: string) => void; onAbrir: (id: string) => void }) {
  // Dentro de cada columna, primero lo que hay que despachar antes.
  // Esperando cobro, por la fecha de cobro (los que no tienen, primero: hay que revisarlos).
  const fechaDe = (p: PedidoDelTablero) => (p.estado === "ESPERANDO_LIQUIDACION_ML" ? (p.fechaLiquidacionMl ?? "0000") : (p.fechaEntrega ?? "9999"));
  const orden = (a: PedidoDelTablero, b: PedidoDelTablero) => fechaDe(a).localeCompare(fechaDe(b));
  const columnas = ETAPAS.map((e) => ({ ...e, pedidos: pedidos.filter((p) => e.estados.includes(p.estado)).sort(orden) })).filter(
    // Reclamos sólo si hay alguno.
    (c) => c.clave !== "reclamo" || c.pedidos.length > 0
  );

  const alSoltar = (r: DropResult) => {
    if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
    const etapa = ETAPAS.find((e) => e.clave === r.destination!.droppableId);
    if (etapa) onEstado(r.draggableId, etapa.estado);
  };

  return (
    <DragDropContext onDragEnd={alSoltar}>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        <div className="flex min-w-max gap-4">
          {columnas.map((col) => {
            const total = col.pedidos.reduce((s, p) => s + totalDe(p), 0);
            return (
              <section key={col.clave} className="flex w-[296px] shrink-0 flex-col rounded-xl bg-muted/50 p-2">
                <header className="flex items-baseline justify-between px-2 pt-1 pb-3">
                  <h2 className="text-sm font-medium">
                    {col.titulo} <span className="ml-1 font-mono text-xs text-muted-foreground">{col.pedidos.length}</span>
                  </h2>
                  {total > 0 && <span className="font-mono text-xs text-muted-foreground tabular-nums">{money(total)}</span>}
                </header>
                <Droppable droppableId={col.clave}>
                  {(drop, estado) => (
                    <div
                      ref={drop.innerRef}
                      {...drop.droppableProps}
                      className={`flex min-h-24 flex-1 flex-col gap-2 rounded-lg transition-colors duration-150 ${estado.isDraggingOver ? "bg-primary/[0.06]" : ""}`}
                    >
                      {col.pedidos.map((p, i) => (
                        <Draggable key={p.id} draggableId={p.id} index={i}>
                          {(drag, d) => (
                            <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}>
                              <Tarjeta p={p} arrastrando={d.isDragging} onAbrir={() => onAbrir(p.id)} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {drop.placeholder}
                      {col.pedidos.length === 0 && !estado.isDraggingOver && <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">Nada acá</p>}
                    </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}
