"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Info, ShoppingCart, Truck, Package, FileText, Calculator, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ESTADOS_PEDIDO, PRIORIDADES, METODOS_ENVIO, METODOS_PAGO, CANALES_VENTA, ETIQUETAS_SUGERIDAS,
} from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { FileUpload } from "@/components/file-upload";

interface Variante {
  id: string;
  nombre: string;
  precioAdicional: number;
}

interface Modelo {
  id: string;
  nombre: string;
  costoFab: number;
  precioVenta: number;
  precioCreditoPorc: number;
  imagenUrl: string | null;
  activo: boolean;
  categorias: Array<{ categoria: { id: string; nombre: string } }>;
  variantes: Variante[];
}

interface Categoria {
  id: string;
  nombre: string;
}

interface Cliente {
  id: string;
  nombre: string;
}

interface ItemForm {
  modeloId: string;
  cantidad: string;
  precioUnitario: string;
  costoUnitario: string;
  ajusteManual: string;
  categoriaFiltro: string;
  variantesSeleccionadas: string[];
}

interface PedidoData {
  id: string;
  prioridad: string;
  clienteId: string | null;
  fechaEntrega: string | null;
  estado: string;
  metodoEnvio: string | null;
  metodoPago: string | null;
  precioEnvio: number;
  senia: number;
  contacto: string | null;
  notas: string | null;
  etiquetas: string[];
  canalVenta: string;
  comprobanteUrl: string | null;
  fechaLiquidacionMl: string | null;
  idMercadolibre: string | null;
  items: {
    modeloId: string;
    cantidad: number;
    precioUnitario: number;
    costoUnitario: number;
    ajusteManual: number;
  }[];
}

const emptyItem: ItemForm = {
  modeloId: "",
  cantidad: "1",
  precioUnitario: "",
  costoUnitario: "",
  ajusteManual: "0",
  categoriaFiltro: "",
  variantesSeleccionadas: [],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pedido: PedidoData | null;
  onSaved: () => void;
}

export function PedidoDialog({ open, onOpenChange, pedido, onSaved }: Props) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);

  const [prioridad, setPrioridad] = useState("MEDIA");
  const [clienteId, setClienteId] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [estado, setEstado] = useState("PENDIENTE_PAGO");
  const [metodoEnvio, setMetodoEnvio] = useState("");
  const [metodoPago, setMetodoPago] = useState("");
  const [precioEnvio, setPrecioEnvio] = useState("0");
  const [senia, setSenia] = useState("0");
  const [contacto, setContacto] = useState("");
  const [notas, setNotas] = useState("");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [canalVenta, setCanalVenta] = useState("directa");
  const [comprobanteUrl, setComprobanteUrl] = useState("");
  const [fechaLiquidacionMl, setFechaLiquidacionMl] = useState("");
  const [idMercadolibre, setIdMercadolibre] = useState("");
  const [items, setItems] = useState<ItemForm[]>([{ ...emptyItem }]);

  const fetchData = useCallback(async () => {
    const [modRes, catRes, cliRes] = await Promise.all([
      fetch("/api/modelos"),
      fetch("/api/categorias"),
      fetch("/api/clientes"),
    ]);
    setModelos(await modRes.json());
    setCategorias(await catRes.json());
    setClientes(await cliRes.json());
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  useEffect(() => {
    if (pedido) {
      setPrioridad(pedido.prioridad);
      setClienteId(pedido.clienteId || "");
      setFechaEntrega(pedido.fechaEntrega ? pedido.fechaEntrega.slice(0, 10) : "");
      setEstado(pedido.estado);
      setMetodoEnvio(pedido.metodoEnvio || "");
      setMetodoPago(pedido.metodoPago || "");
      setPrecioEnvio(pedido.precioEnvio.toString());
      setSenia(pedido.senia.toString());
      setContacto(pedido.contacto || "");
      setNotas(pedido.notas || "");
      setEtiquetas(pedido.etiquetas || []);
      setCanalVenta(pedido.canalVenta || "directa");
      setComprobanteUrl(pedido.comprobanteUrl || "");
      setFechaLiquidacionMl(pedido.fechaLiquidacionMl ? pedido.fechaLiquidacionMl.slice(0, 10) : "");
      setIdMercadolibre(pedido.idMercadolibre || "");
      setItems(
        pedido.items.map((i) => ({
          modeloId: i.modeloId,
          cantidad: i.cantidad.toString(),
          precioUnitario: i.precioUnitario.toString(),
          costoUnitario: i.costoUnitario.toString(),
          ajusteManual: i.ajusteManual.toString(),
          categoriaFiltro: "",
          variantesSeleccionadas: [], // Variants are saved as info, not re-selectable on edit
        }))
      );
    } else {
      setPrioridad("MEDIA");
      setClienteId("");
      setFechaEntrega("");
      setEstado("PENDIENTE_PAGO");
      setMetodoEnvio("");
      setMetodoPago("");
      setPrecioEnvio("0");
      setSenia("0");
      setContacto("");
      setNotas("");
      setEtiquetas([]);
      setCanalVenta("directa");
      setComprobanteUrl("");
      setFechaLiquidacionMl("");
      setIdMercadolibre("");
      setItems([{ ...emptyItem }]);
    }
  }, [pedido, open]);

  const addItem = () => setItems([...items, { ...emptyItem }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ItemForm, value: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };

    // Auto-fill prices when selecting a model
    if (field === "modeloId") {
      const modelo = modelos.find((m) => m.id === value);
      if (modelo) {
        updated[idx].precioUnitario = modelo.precioVenta.toString();
        updated[idx].costoUnitario = modelo.costoFab.toString();
      }
      updated[idx].variantesSeleccionadas = [];
    }

    // Reset model selection when category filter changes
    if (field === "categoriaFiltro") {
      const currentModeloId = updated[idx].modeloId;
      if (currentModeloId && value) {
        const modelo = modelos.find((m) => m.id === currentModeloId);
        const belongsToCategory = modelo?.categorias.some((c) => c.categoria.id === value);
        if (!belongsToCategory) {
          updated[idx].modeloId = "";
          updated[idx].precioUnitario = "";
          updated[idx].costoUnitario = "";
          updated[idx].variantesSeleccionadas = [];
        }
      }
    }

    setItems(updated);
  };

  const toggleEtiqueta = (tag: string) => {
    setEtiquetas((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const calcSubtotal = (item: ItemForm) => {
    const qty = parseInt(item.cantidad) || 0;
    const price = parseFloat(item.precioUnitario) || 0;
    const adj = parseFloat(item.ajusteManual) || 0;
    return qty * price + adj;
  };

  const totalVenta = items.reduce((s, i) => s + calcSubtotal(i), 0) + (parseFloat(precioEnvio) || 0);
  const totalCosto = items.reduce((s, i) => s + (parseInt(i.cantidad) || 0) * (parseFloat(i.costoUnitario) || 0), 0);
  const ganancia = totalVenta - totalCosto;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0 || !items[0].modeloId) return;
    setLoading(true);

    const body = {
      prioridad,
      clienteId: clienteId || null,
      fechaEntrega: fechaEntrega || null,
      estado,
      metodoEnvio: metodoEnvio || null,
      metodoPago: metodoPago || null,
      precioEnvio,
      senia,
      contacto: contacto || null,
      notas: notas || null,
      etiquetas,
      canalVenta,
      comprobanteUrl: comprobanteUrl || null,
      fechaLiquidacionMl: fechaLiquidacionMl || null,
      idMercadolibre: idMercadolibre || null,
      items: items.filter((i) => i.modeloId).map((i) => {
        const modelo = modelos.find(m => m.id === i.modeloId);
        const variantesInfo = i.variantesSeleccionadas
          .map(vid => modelo?.variantes?.find(v => v.id === vid))
          .filter(Boolean)
          .map(v => ({ nombre: v!.nombre, precioAdicional: v!.precioAdicional }));
        return {
          modeloId: i.modeloId,
          cantidad: parseInt(i.cantidad) || 1,
          precioUnitario: parseFloat(i.precioUnitario) || 0,
          costoUnitario: parseFloat(i.costoUnitario) || 0,
          ajusteManual: parseFloat(i.ajusteManual) || 0,
          variantesInfo: variantesInfo.length > 0 ? variantesInfo : undefined,
        };
      }),
    };

    const url = pedido ? `/api/pedidos/${pedido.id}` : "/api/pedidos";
    const method = pedido ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);
    onSaved();
  };

  const modelosFiltrados = (categoriaId: string) => {
    const activos = modelos.filter((m) => m.activo);
    if (!categoriaId) return activos;
    return activos.filter((m) =>
      m.categorias.some((c) => c.categoria.id === categoriaId)
    );
  };

  const toggleVariante = (itemIdx: number, varianteId: string) => {
    const updated = [...items];
    const current = updated[itemIdx].variantesSeleccionadas;
    if (current.includes(varianteId)) {
      updated[itemIdx] = { ...updated[itemIdx], variantesSeleccionadas: current.filter(id => id !== varianteId) };
    } else {
      updated[itemIdx] = { ...updated[itemIdx], variantesSeleccionadas: [...current, varianteId] };
    }
    // Recalculate price with variants
    const modelo = modelos.find(m => m.id === updated[itemIdx].modeloId);
    if (modelo) {
      const basePrice = modelo.precioVenta;
      const variantExtra = updated[itemIdx].variantesSeleccionadas.reduce((sum, vid) => {
        const v = modelo.variantes?.find(v => v.id === vid);
        return sum + (v?.precioAdicional || 0);
      }, 0);
      updated[itemIdx].precioUnitario = (basePrice + variantExtra).toString();
    }
    setItems(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pedido ? "Editar Pedido" : "Nuevo Pedido"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Info general */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Info className="h-4 w-4" />
              Información general
            </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v ?? "MEDIA")}>
                <SelectTrigger>
                  <span className="truncate">{PRIORIDADES[prioridad as keyof typeof PRIORIDADES]?.label ?? prioridad}</span>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORIDADES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v ?? "PENDIENTE_PAGO")}>
                <SelectTrigger>
                  <span className="truncate">{ESTADOS_PEDIDO[estado as keyof typeof ESTADOS_PEDIDO]?.label ?? estado}</span>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADOS_PEDIDO).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Canal de venta</Label>
              <Select value={canalVenta} onValueChange={(v) => setCanalVenta(v ?? "directa")}>
                <SelectTrigger>
                  <span className="truncate">{CANALES_VENTA.find(c => c.value === canalVenta)?.label ?? canalVenta}</span>
                </SelectTrigger>
                <SelectContent>
                  {CANALES_VENTA.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>

          {canalVenta === "mercadolibre" && (
            <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Store className="h-4 w-4" />
              MercadoLibre
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ID de MercadoLibre</Label>
                <Input value={idMercadolibre} onChange={(e) => setIdMercadolibre(e.target.value)} placeholder="Ej: 2000005123456789" />
              </div>
              <div className="space-y-2">
                <Label>Fecha liquidación ML</Label>
                <Input type="date" value={fechaLiquidacionMl} onChange={(e) => setFechaLiquidacionMl(e.target.value)} />
              </div>
            </div>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Cliente y entrega
            </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={clienteId || "ninguno"} onValueChange={(v) => setClienteId(v === "ninguno" ? "" : (v ?? ""))}>
                <SelectTrigger>
                  <span className="truncate">{clienteId ? clientes.find(c => c.id === clienteId)?.nombre ?? "..." : "Sin cliente"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin cliente</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha de entrega</Label>
              <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </div>
          </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Envío y pago
            </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Método de envío</Label>
              <Select value={metodoEnvio || "ninguno"} onValueChange={(v) => setMetodoEnvio(v === "ninguno" ? "" : (v ?? ""))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin definir</SelectItem>
                  {METODOS_ENVIO.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Método de pago</Label>
              <Select value={metodoPago || "ninguno"} onValueChange={(v) => setMetodoPago(v === "ninguno" ? "" : (v ?? ""))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Sin definir</SelectItem>
                  {METODOS_PAGO.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Precio envío</Label>
              <Input type="number" step="1" value={precioEnvio} onChange={(e) => setPrecioEnvio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Seña</Label>
              <Input type="number" step="1" value={senia} onChange={(e) => setSenia(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contacto</Label>
              <Input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Tel, IG, etc." />
            </div>
          </div>

          {/* Etiquetas */}
          <div className="space-y-2">
            <Label>Etiquetas</Label>
            <div className="flex gap-2 flex-wrap">
              {ETIQUETAS_SUGERIDAS.map((tag) => (
                <Badge
                  key={tag}
                  variant={etiquetas.includes(tag) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleEtiqueta(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Comprobante de pago */}
          <div className="space-y-2">
            <Label>Comprobante de pago</Label>
            <FileUpload
              bucket="comprobantes"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              currentUrl={comprobanteUrl || null}
              onUploaded={(url) => setComprobanteUrl(url)}
              onRemoved={() => setComprobanteUrl("")}
              label="Subir comprobante"
              compact
            />
          </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Artículos
            </h4>
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Ítems del pedido</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-3 w-3" /> Agregar ítem
              </Button>
            </div>
            {items.map((item, idx) => (
              <div key={idx} className="rounded-lg border bg-card p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Ítem {idx + 1}</span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-7 w-7">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Categoría (filtro)</Label>
                    <Select
                      value={item.categoriaFiltro || "todas"}
                      onValueChange={(v) => updateItem(idx, "categoriaFiltro", v === "todas" ? "" : (v ?? ""))}
                    >
                      <SelectTrigger>
                        <span className="truncate">
                          {item.categoriaFiltro
                            ? categorias.find((c) => c.id === item.categoriaFiltro)?.nombre ?? "..."
                            : "Todas las categorías"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas las categorías</SelectItem>
                        {categorias.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Modelo <span className="text-destructive">*</span></Label>
                    <Select
                      value={item.modeloId || "placeholder"}
                      onValueChange={(v) => updateItem(idx, "modeloId", v === "placeholder" ? "" : (v ?? ""))}
                    >
                      <SelectTrigger>
                        <span className="truncate">
                          {item.modeloId
                            ? modelos.find((m) => m.id === item.modeloId)?.nombre ?? "..."
                            : "Seleccionar"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder" disabled>Seleccionar</SelectItem>
                        {modelosFiltrados(item.categoriaFiltro).map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Variantes */}
                {item.modeloId && (() => {
                  const modelo = modelos.find(m => m.id === item.modeloId);
                  if (!modelo?.variantes?.length) return null;
                  return (
                    <div className="space-y-1.5">
                      <Label className="text-sm">Variantes</Label>
                      <div className="flex flex-wrap gap-2">
                        {modelo.variantes.map((v) => {
                          const selected = item.variantesSeleccionadas.includes(v.id);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => toggleVariante(idx, v.id)}
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                                selected
                                  ? "border-primary bg-primary/10 text-primary font-medium"
                                  : "border-border bg-background hover:bg-muted"
                              }`}
                            >
                              <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center text-xs ${
                                selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"
                              }`}>
                                {selected && "\u2713"}
                              </span>
                              {v.nombre}
                              {v.precioAdicional > 0 && (
                                <span className="text-muted-foreground text-xs">(+${v.precioAdicional.toLocaleString("es-AR")})</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Cantidad</Label>
                    <Input type="number" min="1" value={item.cantidad} onChange={(e) => updateItem(idx, "cantidad", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Precio unit.</Label>
                    <Input type="number" step="1" value={item.precioUnitario} onChange={(e) => updateItem(idx, "precioUnitario", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Costo unit.</Label>
                    <Input type="number" step="1" value={item.costoUnitario} onChange={(e) => updateItem(idx, "costoUnitario", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Ajuste</Label>
                    <Input type="number" step="1" value={item.ajusteManual} onChange={(e) => updateItem(idx, "ajusteManual", e.target.value)} />
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  Subtotal: <span className="font-medium text-foreground">${calcSubtotal(item).toFixed(0)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totales */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Resumen
            </h4>
          <div className="rounded-md bg-muted p-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span>Total venta (con envío)</span>
              <span className="font-medium">${totalVenta.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total costo fabricación</span>
              <span className="font-medium">${totalCosto.toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t pt-1">
              <span>Ganancia estimada</span>
              <span className={ganancia >= 0 ? "text-green-600" : "text-red-500"}>
                ${ganancia.toFixed(0)}
              </span>
            </div>
            {parseFloat(senia) > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Restante a cobrar</span>
                <span>${(totalVenta - parseFloat(senia)).toFixed(0)}</span>
              </div>
            )}
          </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notas
            </h4>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>

          <div className="sticky bottom-0 bg-background pt-4 border-t">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Guardando..." : "Guardar"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
