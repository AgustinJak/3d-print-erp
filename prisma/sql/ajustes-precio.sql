-- docs/sdd/015 (ajustes de precio por producto): un % por canal y un envío propio por canal, con
-- fecha de fin opcional. Aditivo. Sólo lo usa el servidor (RLS sin políticas).
CREATE TABLE IF NOT EXISTS public.ajustes_precio (
  id             text PRIMARY KEY,
  tenant_id      text NOT NULL DEFAULT 'sendero3d',
  modelo_id      text NOT NULL REFERENCES public.modelos(id) ON DELETE CASCADE,
  canal          text NOT NULL CHECK (canal IN ('ml', 'web', 'personalizado')),
  tipo           text NOT NULL CHECK (tipo IN ('porcentaje', 'envio')),
  -- porcentaje: +3 = 3 % más, -5 = 5 % menos. envio: pesos por unidad.
  valor          numeric NOT NULL,
  -- null = sin fecha de fin. Vencido, el cálculo lo ignora (RN-2).
  hasta          timestamptz,
  nota           text,
  usuario        text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  -- La venta directa no lleva envío.
  CHECK (NOT (tipo = 'envio' AND canal = 'personalizado')),
  -- RN-3: a lo sumo un % y un envío por canal y producto.
  UNIQUE (tenant_id, modelo_id, canal, tipo)
);
CREATE INDEX IF NOT EXISTS ajustes_precio_modelo ON public.ajustes_precio (tenant_id, modelo_id);
ALTER TABLE public.ajustes_precio ENABLE ROW LEVEL SECURITY;
