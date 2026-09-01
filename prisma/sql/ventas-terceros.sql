-- Cierre mensual de las ventas de Shay Juguetes en la cuenta de ML compartida.
-- RLS encendida como en toda tabla nueva: Prisma entra como `postgres` y la
-- saltea; la anon key queda sin acceso (cero políticas).

CREATE TABLE IF NOT EXISTS public.ventas_terceros (
  id           text PRIMARY KEY,
  tenant_id    text NOT NULL DEFAULT 'sendero3d',
  socio        text NOT NULL,
  anio         integer NOT NULL,
  mes          integer NOT NULL,
  unidades     integer NOT NULL DEFAULT 0,
  bruto        double precision NOT NULL DEFAULT 0,
  comision     double precision NOT NULL DEFAULT 0,
  neto         double precision NOT NULL DEFAULT 0,
  pedidos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculado_en timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ventas_terceros_periodo_key
  ON public.ventas_terceros (tenant_id, socio, anio, mes);

ALTER TABLE public.ventas_terceros ENABLE ROW LEVEL SECURITY;
