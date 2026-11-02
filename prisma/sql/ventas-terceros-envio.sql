-- Reparto con Shay (2026-11-02): el envío que ML le cobra al vendedor se imputa directo a cada
-- uno, y la proporción de los gastos compartidos es por bruto sobre todas las ventas del mes
-- (incluidas las de Sendero fuera de ML). Aditivo: lo desplegado antes no las lee.
ALTER TABLE public.ventas_terceros
  ADD COLUMN IF NOT EXISTS envio       double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bruto_otros double precision NOT NULL DEFAULT 0;
