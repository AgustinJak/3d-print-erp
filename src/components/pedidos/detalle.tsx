"use client";

import { Calendar, Copy, CreditCard, FileText, Package, Pencil, Truck, User, Zap } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PuntoDeCuenta, useCuentaActiva } from "@/components/cuenta-activa";
import { ESTADOS_PEDIDO, PRIORIDADES } from "@/lib/constants";
import { nombreDeItem, variantesDeItem } from "@/lib/items";

/**
 * El detalle de un pedido (docs/sdd/011): lo que hay que saber de un vistazo, sin el formulario. El
 * lápiz de arriba abre el editor de siempre.
 */

interface ItemDelDetalle {
  id: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  ajusteManual: number;
  descripcion?: string | null;
  variantesInfo: Array<{ nombre: string }> | null;
  modelo: { id: string; nombre: string; imagenUrl: string | null } | null;
}

export interface PedidoDelDetalle {
  id: string;
  estado: string;
  prioridad: string;
  fechaPedido: string;
  fechaEntrega: string | null;
  metodoEnvio: string | null;
  metodoPago: string | null;
  precioEnvio: number;
  senia: number;
  contacto: string | null;
  notas: string | null;
  etiquetas: string[];
  canalVenta: string;
  idMercadolibre: string | null;
  cliente: { nombre: string } | null;
  items: ItemDelDetalle[];
}

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : "—");
const CANAL: Record<string, string> = { mercadolibre: "Mercado Libre", shop: "Web", directa: "Venta directa" };

function Dato({ icono: Icono, label, children }: { icono: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icono className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm">{children}</dd>
      </div>
    </div>
  );
}

export function DetalleDePedido({ pedido, onCerrar, onEditar }: { pedido: PedidoDelDetalle | null; onCerrar: () => void; onEditar: (id: string) => void }) {
  const { cuentas } = useCuentaActiva();
  const p = pedido;
  const venta = p ? p.items.reduce((s, i) => s + i.precioUnitario * i.cantidad + i.ajusteManual, 0) : 0;
  const fabricacion = p ? p.items.reduce((s, i) => s + i.costoUnitario * i.cantidad, 0) : 0;
  const ganancia = venta - fabricacion;
  const margen = venta > 0 ? (ganancia / venta) * 100 : 0;
  const estado = p ? ESTADOS_PEDIDO[p.estado as keyof typeof ESTADOS_PEDIDO] : null;
  const prioridad = p ? PRIORIDADES[p.prioridad as keyof typeof PRIORIDADES] : null;
  const deCuenta = p?.canalVenta === "mercadolibre" ? (cuentas.otra && p.etiquetas.includes(cuentas.otra) ? "otra" : "principal") : null;
  const etiquetas = p?.etiquetas.filter((e) => e !== cuentas.otra && e !== "flex") ?? [];

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`Copiado: ${texto}`);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {p && (
          <>
            {/* Encabezado: quién, en qué estado y por dónde */}
            <div className="border-b p-6 pr-24">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <span className={`h-2 w-2 rounded-full ${estado?.color ?? "bg-muted-foreground/40"}`} />
                  {estado?.label ?? p.estado}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  {deCuenta && <PuntoDeCuenta de={deCuenta} />}
                  {CANAL[p.canalVenta] ?? p.canalVenta}
                  {deCuenta && cuentas.otra && ` · ${deCuenta === "principal" ? cuentas.principal : cuentas.otra}`}
                </span>
                {p.etiquetas.includes("flex") && (
                  <span className="inline-flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" strokeWidth={1.5} /> Flex
                  </span>
                )}
                {prioridad && p.prioridad !== "MEDIA" && <span className={p.prioridad === "URGENTE" ? "text-red-600 dark:text-red-400" : ""}>Prioridad {prioridad.label.toLowerCase()}</span>}
              </div>
              <DialogTitle className="mt-2 text-2xl leading-tight font-medium">{p.cliente?.nombre ?? "Sin cliente"}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-xs">
                <button type="button" onClick={() => copiar(p.id)} className="inline-flex items-center gap-1 transition-colors hover:text-foreground" title="Copiar el número de pedido">
                  {p.id.slice(-8)} <Copy className="h-3 w-3" strokeWidth={1.5} />
                </button>
                {p.idMercadolibre && (
                  <button type="button" onClick={() => copiar(p.idMercadolibre!)} className="inline-flex items-center gap-1 transition-colors hover:text-foreground" title="Copiar el número de venta de ML">
                    ML {p.idMercadolibre} <Copy className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                )}
              </DialogDescription>
            </div>

            {/* El lápiz va junto a la cruz de cerrar */}
            <Button variant="ghost" size="icon" className="absolute top-2 right-11 h-8 w-8 text-muted-foreground" onClick={() => onEditar(p.id)} title="Editar el pedido" aria-label="Editar el pedido">
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
            </Button>

            {/* La plata: la ganancia es la cifra que importa */}
            <dl className="grid grid-cols-3 gap-px border-b bg-border">
              <div className="bg-background p-5">
                <dt className="text-xs text-muted-foreground">Venta{p.precioEnvio > 0 ? " (sin envío)" : ""}</dt>
                <dd className="mt-1 font-mono text-xl font-medium tabular-nums">{money(venta)}</dd>
              </div>
              <div className="bg-background p-5">
                <dt className="text-xs text-muted-foreground">Fabricación</dt>
                <dd className="mt-1 font-mono text-xl font-medium tabular-nums">{money(fabricacion)}</dd>
              </div>
              <div className="bg-background p-5">
                <dt className="text-xs text-muted-foreground">Ganancia</dt>
                <dd className={`mt-1 font-mono text-xl font-medium tabular-nums ${ganancia < 0 ? "text-red-600 dark:text-red-400" : "text-primary"}`}>{money(ganancia)}</dd>
                <dd className="text-xs text-muted-foreground">{Math.round(margen)} % de la venta</dd>
              </div>
            </dl>

            {/* Lo que lleva */}
            <section className="border-b p-6">
              <h3 className="mb-3 text-sm font-medium">
                {p.items.length === 1 ? "Producto" : `${p.items.length} productos`}
              </h3>
              <ul className="space-y-3">
                {p.items.map((i) => {
                  const sub = i.precioUnitario * i.cantidad + i.ajusteManual;
                  const variantes = variantesDeItem(i);
                  return (
                    <li key={i.id} className="flex items-center gap-4">
                      {i.modelo?.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.modelo.imagenUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border" />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Package className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{nombreDeItem(i)}</p>
                        {variantes.length > 0 && <p className="truncate text-[13px] text-muted-foreground">{variantes.join(" · ")}</p>}
                        <p className="font-mono text-xs text-muted-foreground tabular-nums">
                          {i.cantidad} × {money(i.precioUnitario)}
                          {i.ajusteManual !== 0 && ` ${i.ajusteManual > 0 ? "+" : "−"} ${money(Math.abs(i.ajusteManual))}`}
                          {" · fabricación "}
                          {money(i.costoUnitario * i.cantidad)}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm tabular-nums">{money(sub)}</span>
                    </li>
                  );
                })}
              </ul>
              {(p.precioEnvio > 0 || p.senia > 0) && (
                <div className="mt-4 space-y-1 border-t pt-3 text-[13px]">
                  {p.precioEnvio > 0 && (
                    <p className="flex justify-between">
                      <span className="text-muted-foreground">Envío</span>
                      <span className="font-mono tabular-nums">{money(p.precioEnvio)}</span>
                    </p>
                  )}
                  {p.senia > 0 && (
                    <p className="flex justify-between">
                      <span className="text-muted-foreground">Seña · falta cobrar</span>
                      <span className="font-mono tabular-nums">
                        {money(p.senia)} · {money(venta + p.precioEnvio - p.senia)}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* El resto, en dos columnas */}
            <dl className="grid gap-5 p-6 sm:grid-cols-2">
              <Dato icono={Calendar} label="Fecha del pedido">
                {fecha(p.fechaPedido)}
              </Dato>
              <Dato icono={Truck} label="Entrega">
                {fecha(p.fechaEntrega)}
                {p.metodoEnvio && <span className="text-muted-foreground"> · {p.metodoEnvio}</span>}
              </Dato>
              {p.contacto && (
                <Dato icono={User} label="Contacto">
                  {p.contacto}
                </Dato>
              )}
              {p.metodoPago && (
                <Dato icono={CreditCard} label="Pago">
                  {p.metodoPago}
                </Dato>
              )}
              {(p.notas || etiquetas.length > 0) && (
                <div className="sm:col-span-2">
                  <Dato icono={FileText} label="Notas">
                    {etiquetas.length > 0 && (
                      <span className="mb-1.5 flex flex-wrap gap-1">
                        {etiquetas.map((e) => (
                          <span key={e} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {e.replace(/_/g, " ")}
                          </span>
                        ))}
                      </span>
                    )}
                    {p.notas && <span className="block whitespace-pre-line text-[13px] leading-5 text-muted-foreground">{p.notas}</span>}
                  </Dato>
                </div>
              )}
            </dl>

            <div className="flex justify-end gap-2 border-t p-4">
              <Button variant="outline" onClick={onCerrar}>
                Cerrar
              </Button>
              <Button onClick={() => onEditar(p.id)}>
                <Pencil className="h-4 w-4" strokeWidth={1.5} /> Editar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
