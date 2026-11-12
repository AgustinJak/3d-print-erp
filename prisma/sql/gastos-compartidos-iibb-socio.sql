-- Reparto con Shay (2026-11-12): el convenio multilateral de Shay es un monto fijo que carga
-- Agustín (lo calcula afuera, con las facturas), no un prorrateo del total de la cuenta.
-- `iibb` sigue guardando el total que se cargó en los meses anteriores: si `iibb_socio` es null, el
-- reparto de ese mes sigue como estaba. Aditivo: lo desplegado antes no la lee.
ALTER TABLE public.gastos_compartidos
  ADD COLUMN IF NOT EXISTS iibb_socio double precision;
