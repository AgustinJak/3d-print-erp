-- Combinaciones vendibles, mapeo por canal y la combinación de cada línea de pedido.
-- docs/sdd/001-mapeo-de-productos (specs 001, 003 y 004).
--
-- Se aplica a mano (no hay migraciones activas en este proyecto): las tablas las
-- crea este archivo y Prisma solo genera el cliente. Aditivo y compatible con el
-- código que ya está en producción: nada de lo que corre hoy lee estas columnas.
--
-- Regla de la casa: RLS ENCENDIDA en toda tabla nueva. Prisma entra como
-- `postgres` y la saltea; la anon key queda sin acceso (cero políticas).

-- Lo que se vende: un modelo más las variantes que lo definen (cero o más).
CREATE TABLE IF NOT EXISTS public.combinaciones (
  id         text PRIMARY KEY,
  tenant_id  text NOT NULL DEFAULT 'sendero3d',
  modelo_id  text NOT NULL REFERENCES public.modelos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  variantes  text[] NOT NULL DEFAULT '{}',   -- ids de variantes_modelo, ordenados
  clave      text NOT NULL,                  -- "<modelo_id>|<variantes ordenadas, con coma>"
  sku        text,                           -- siempre en mayúsculas; null si el modelo no tiene SKU
  nombre     text NOT NULL,
  activo     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS combinaciones_tenant_id_clave_key ON public.combinaciones (tenant_id, clave);
-- Varios null no chocan: un modelo sin SKU deja a sus combinaciones sin SKU.
CREATE UNIQUE INDEX IF NOT EXISTS combinaciones_tenant_id_sku_key   ON public.combinaciones (tenant_id, sku);
CREATE INDEX        IF NOT EXISTS combinaciones_tenant_id_modelo_id_idx ON public.combinaciones (tenant_id, modelo_id);

-- A qué combinación corresponde cada publicación de un canal. Sin combinación = cola.
CREATE TABLE IF NOT EXISTS public.mapeos_canal (
  id             text PRIMARY KEY,
  tenant_id      text NOT NULL DEFAULT 'sendero3d',
  canal          text NOT NULL CHECK (canal IN ('mercadolibre', 'shop')),
  clave          text NOT NULL,
  combinacion_id text REFERENCES public.combinaciones(id) ON UPDATE CASCADE ON DELETE SET NULL,
  unidades       integer NOT NULL DEFAULT 1 CHECK (unidades >= 1),
  ignorar        boolean NOT NULL DEFAULT false,
  origen         text NOT NULL DEFAULT 'auto' CHECK (origen IN ('siembra', 'auto', 'manual')),
  descripcion    text,
  muestra        jsonb,
  veces_vista    integer NOT NULL DEFAULT 0,
  ultima_venta   text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mapeos_canal_tenant_id_canal_clave_key ON public.mapeos_canal (tenant_id, canal, clave);
CREATE INDEX        IF NOT EXISTS mapeos_canal_combinacion_id_idx       ON public.mapeos_canal (combinacion_id);

-- La línea del pedido: qué combinación se vendió y con qué clave entró del canal
-- (para completarla cuando se mapea una clave de la cola).
ALTER TABLE public.items_pedido
  ADD COLUMN IF NOT EXISTS combinacion_id text REFERENCES public.combinaciones(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS clave_canal    text;

CREATE INDEX IF NOT EXISTS items_pedido_combinacion_id_idx ON public.items_pedido (combinacion_id);
CREATE INDEX IF NOT EXISTS items_pedido_clave_canal_idx    ON public.items_pedido (clave_canal);

ALTER TABLE public.combinaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mapeos_canal  ENABLE ROW LEVEL SECURITY;
