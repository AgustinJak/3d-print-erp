-- docs/sdd/019-retirar-con-la-plata-real — cuánto se puede retirar, con el saldo real de Mercado Pago.
-- Aditivo. Aplicado en producción el 2026-11-27.

-- El saldo disponible de Mercado Pago, leído del reporte de liberaciones (la API no da el saldo en el
-- momento). Una fila por lectura.
CREATE TABLE IF NOT EXISTS public.saldos_mp (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  saldo       double precision NOT NULL,
  -- La hora del último movimiento del reporte: el saldo es "a esa hora".
  al          timestamptz NOT NULL,
  leido_en    timestamptz NOT NULL DEFAULT now(),
  reporte     text
);
CREATE INDEX IF NOT EXISTS saldos_mp_tenant_leido ON public.saldos_mp (tenant_id, leido_en DESC);

-- El resumen de la tarjeta de Mercado Pago, cargado a mano (no hay API). Lo personal lo deposita cada
-- socio en Mercado Pago antes del vencimiento (decisión de Agustín, 2026-11-27).
CREATE TABLE IF NOT EXISTS public.resumenes_tarjeta (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  cierre      date NOT NULL,
  vencimiento date NOT NULL,
  total       double precision NOT NULL,
  -- [{ "socio": "Taiel", "monto": 12345, "depositado": false }]
  partes      jsonb NOT NULL DEFAULT '[]'::jsonb,
  pagado      boolean NOT NULL DEFAULT false,
  notas       text,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resumenes_tarjeta_cierre UNIQUE (tenant_id, cierre)
);

-- Lo que se le pagó a Shay de cada mes.
ALTER TABLE public.ventas_terceros ADD COLUMN IF NOT EXISTS pagado_monto double precision;
ALTER TABLE public.ventas_terceros ADD COLUMN IF NOT EXISTS pagado_en date;

ALTER TABLE public.saldos_mp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumenes_tarjeta ENABLE ROW LEVEL SECURITY;

-- Octubre ya se le pagó: la transferencia del 17/11 (confirmado por Agustín el 2026-11-27).
UPDATE public.ventas_terceros SET pagado_monto = 666980, pagado_en = '2026-11-17'
 WHERE tenant_id = 'sendero3d' AND socio = 'shayjuguetes' AND anio = 2026 AND mes = 10 AND pagado_en IS NULL;
