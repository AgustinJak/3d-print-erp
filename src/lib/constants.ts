export const ESTADOS_PEDIDO = {
  PENDIENTE_PAGO: { label: "Pendiente de pago", color: "bg-yellow-500" },
  CONFIRMADO: { label: "Confirmado", color: "bg-blue-500" },
  EN_PRODUCCION: { label: "En producción", color: "bg-orange-500" },
  TERMINADO: { label: "Terminado", color: "bg-emerald-500" },
  ENTREGADO: { label: "Entregado", color: "bg-green-600" },
  ESPERANDO_LIQUIDACION_ML: { label: "Esperando liquidación ML", color: "bg-purple-500" },
  COMPLETADO: { label: "Completado", color: "bg-green-700" },
  CANCELADO: { label: "Cancelado", color: "bg-red-500" },
} as const;

export const PRIORIDADES = {
  BAJA: { label: "Baja", color: "bg-slate-400" },
  MEDIA: { label: "Media", color: "bg-blue-400" },
  ALTA: { label: "Alta", color: "bg-orange-500" },
  URGENTE: { label: "Urgente", color: "bg-red-500" },
} as const;

export const METODOS_ENVIO = [
  "Retiro en local",
  "Correo Argentino",
  "Entrega personal",
  "Envío MercadoLibre",
] as const;

export const METODOS_PAGO = [
  "Efectivo",
  "Débito",
  "Crédito",
  "Transferencia",
] as const;

export const CANALES_VENTA = [
  { value: "directa", label: "Venta directa" },
  { value: "mercadolibre", label: "MercadoLibre" },
] as const;

export const ETIQUETAS_SUGERIDAS = [
  "urgente",
  "regalo",
  "mayorista",
  "cliente recurrente",
] as const;
