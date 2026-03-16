"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, User, Phone, Mail, MapPin, FileText, ShoppingCart,
  DollarSign, CreditCard, Calendar, TrendingUp, Clock, Package,
  Pencil, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/data-loading";
import { ESTADOS_PEDIDO, PLATAFORMAS_CLIENTE, TIPOS_CLIENTE } from "@/lib/constants";

interface ItemPedido {
  id: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  ajusteManual: number;
  variantesInfo: Array<{ nombre: string }> | null;
  modelo: { id: string; nombre: string; imagenUrl: string | null };
}

interface Pedido {
  id: string;
  estado: keyof typeof ESTADOS_PEDIDO;
  fechaPedido: string;
  fechaEntrega: string | null;
  metodoPago: string | null;
  metodoEnvio: string | null;
  precioEnvio: number;
  senia: number;
  canalVenta: string;
  notas: string | null;
  items: ItemPedido[];
}

interface Metricas {
  totalGastado: number;
  pedidosCount: number;
  enCurso: number;
  ticketPromedio: number;
  metodoHabitual: string | null;
  mesHabitual: string | null;
  diaHabitual: string | null;
}

interface ClienteDetail {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  plataforma: string | null;
  tipoCliente: string | null;
  creadoEn: string;
  pedidos: Pedido[];
  metricas: Metricas;
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function pedidoTotal(p: Pedido) {
  return (
    p.items.reduce(
      (s, i) => s + i.precioUnitario * i.cantidad + i.ajusteManual,
      0
    ) + p.precioEnvio
  );
}

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/clientes/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setCliente(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <TableSkeleton cols={3} />;
  if (notFound || !cliente) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <User className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Cliente no encontrado</p>
        <Button variant="outline" onClick={() => router.push("/clientes")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver a clientes
        </Button>
      </div>
    );
  }

  const m = cliente.metricas;
  const plataformaLabel = PLATAFORMAS_CLIENTE.find(
    (p) => p.value === cliente.plataforma
  )?.label;
  const tipoLabel = TIPOS_CLIENTE.find(
    (t) => t.value === cliente.tipoCliente
  )?.label;

  const pedidosEnCurso = cliente.pedidos.filter(
    (p) => p.estado !== "COMPLETADO" && p.estado !== "CANCELADO"
  );
  const pedidosHistorial = cliente.pedidos.filter(
    (p) => p.estado === "COMPLETADO" || p.estado === "CANCELADO"
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/clientes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{cliente.nombre}</h1>
              {plataformaLabel && (
                <Badge variant="secondary" className="text-xs">
                  {plataformaLabel}
                </Badge>
              )}
              {tipoLabel && (
                <Badge variant="outline" className="text-xs">
                  {tipoLabel}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cliente desde {formatDate(cliente.creadoEn)}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/clientes")}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Editar
        </Button>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total gastado
            </div>
            <p className="text-xl font-bold">{formatMoney(m.totalGastado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ShoppingCart className="h-4 w-4" />
              Pedidos
            </div>
            <p className="text-xl font-bold">{m.pedidosCount}</p>
            {m.enCurso > 0 && (
              <p className="text-xs text-amber-600">{m.enCurso} en curso</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              Ticket promedio
            </div>
            <p className="text-xl font-bold">{formatMoney(m.ticketPromedio)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CreditCard className="h-4 w-4" />
              Pago habitual
            </div>
            <p className="text-xl font-bold">{m.metodoHabitual || "—"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Contact info + habits */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" /> Información
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {cliente.telefono && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{cliente.telefono}</span>
                </div>
              )}
              {cliente.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{cliente.email}</span>
                </div>
              )}
              {cliente.direccion && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{cliente.direccion}</span>
                </div>
              )}
              {!cliente.telefono && !cliente.email && !cliente.direccion && (
                <p className="text-muted-foreground">Sin datos de contacto</p>
              )}
              {cliente.notas && (
                <div className="pt-2 border-t">
                  <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                    <FileText className="h-3 w-3" /> Notas
                  </div>
                  <p>{cliente.notas}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Hábitos de compra
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mes más frecuente</span>
                <span className="font-medium">{m.mesHabitual || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Día más frecuente</span>
                <span className="font-medium">{m.diaHabitual || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pago habitual</span>
                <span className="font-medium">{m.metodoHabitual || "—"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Tags card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Tag className="h-4 w-4" /> Etiquetas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {plataformaLabel && (
                <Badge className="bg-blue-500/10 text-blue-600 border-blue-300">
                  {plataformaLabel}
                </Badge>
              )}
              {tipoLabel && (
                <Badge className="bg-purple-500/10 text-purple-600 border-purple-300">
                  {tipoLabel}
                </Badge>
              )}
              {!plataformaLabel && !tipoLabel && (
                <p className="text-sm text-muted-foreground">Sin etiquetas</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Orders */}
        <div className="lg:col-span-2 space-y-4">
          {/* En curso */}
          {pedidosEnCurso.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Pedidos en curso ({pedidosEnCurso.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <OrderTable pedidos={pedidosEnCurso} />
              </CardContent>
            </Card>
          )}

          {/* Historial */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                Historial de pedidos ({pedidosHistorial.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {pedidosHistorial.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">Sin pedidos completados</p>
              ) : (
                <OrderTable pedidos={pedidosHistorial} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OrderTable({ pedidos }: { pedidos: Pedido[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Modelos</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pedidos.map((p) => {
            const estado = ESTADOS_PEDIDO[p.estado];
            const total = pedidoTotal(p);
            return (
              <TableRow key={p.id}>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(p.fechaPedido)}
                </TableCell>
                <TableCell className="max-w-[220px]">
                  <div className="flex flex-col gap-0.5">
                    {p.items.map((item) => (
                      <div key={item.id} className="flex flex-col">
                        <span className="text-sm font-medium truncate">
                          {item.cantidad > 1 && (
                            <span className="text-muted-foreground mr-1">{item.cantidad}x</span>
                          )}
                          {item.modelo.nombre}
                        </span>
                        {item.variantesInfo && item.variantesInfo.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {item.variantesInfo.map((v, vi) => (
                              <Badge
                                key={vi}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 border-blue-400/60 text-blue-500"
                              >
                                {v.nombre}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={`text-xs text-white ${estado?.color || "bg-gray-500"}`}
                  >
                    {estado?.label || p.estado}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium text-sm">
                  {formatMoney(total)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
