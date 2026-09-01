-- Descuentos sobre la parte de Shay: publicidad, percepciones, convenio
-- multilateral y monotributo. Se cargan a mano en Finanzas.
ALTER TABLE public.ventas_terceros
  ADD COLUMN IF NOT EXISTS publicidad   double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percepciones double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iibb         double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monotributo  double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas        text;
