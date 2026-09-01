-- Los impuestos de la cuenta de ML no son de una tienda sola: se cargan una vez
-- por mes y cada tienda se hace cargo de su parte según cuánto vendió.
-- La publicidad no entra acá: esa se imputa directo por campaña.

CREATE TABLE IF NOT EXISTS public.gastos_compartidos (
  id           text PRIMARY KEY,
  tenant_id    text NOT NULL DEFAULT 'sendero3d',
  anio         integer NOT NULL,
  mes          integer NOT NULL,
  percepciones double precision NOT NULL DEFAULT 0,
  iibb         double precision NOT NULL DEFAULT 0,
  monotributo  double precision NOT NULL DEFAULT 0,
  notas        text,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gastos_compartidos_periodo_key
  ON public.gastos_compartidos (tenant_id, anio, mes);

ALTER TABLE public.gastos_compartidos ENABLE ROW LEVEL SECURITY;

-- El otro lado de la cuenta, para poder calcular la proporción del reparto.
ALTER TABLE public.ventas_terceros
  ADD COLUMN IF NOT EXISTS unidades_propias integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bruto_propio     double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comision_propia  double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS neto_propio      double precision NOT NULL DEFAULT 0;

-- Estos tres pasan a ser del mes, no de la tienda.
ALTER TABLE public.ventas_terceros
  DROP COLUMN IF EXISTS percepciones,
  DROP COLUMN IF EXISTS iibb,
  DROP COLUMN IF EXISTS monotributo;
