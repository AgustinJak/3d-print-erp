-- Reservas de stock por pedido + recetas de insumo.
-- Se aplica a mano (no hay migraciones activas en este proyecto): las tablas
-- las crea este archivo y Prisma solo genera el cliente.
--
-- Regla de la casa: RLS ENCENDIDA en toda tabla nueva. Prisma entra como
-- `postgres` y la saltea; la anon key queda sin acceso (cero políticas).

CREATE TABLE IF NOT EXISTS public.reservas_stock (
  id           text PRIMARY KEY,
  tenant_id    text NOT NULL DEFAULT 'sendero3d',
  stock_id     text NOT NULL REFERENCES public.stock(id) ON DELETE CASCADE,
  pedido_id    text NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  item_id      text REFERENCES public.items_pedido(id) ON DELETE CASCADE,
  cantidad     integer NOT NULL,
  estado       text NOT NULL DEFAULT 'RESERVADA',
  tipo         text NOT NULL DEFAULT 'producto',
  creado_en    timestamptz NOT NULL DEFAULT now(),
  consumida_en timestamptz
);

CREATE INDEX IF NOT EXISTS reservas_stock_tenant_estado_idx ON public.reservas_stock (tenant_id, estado);
CREATE INDEX IF NOT EXISTS reservas_stock_pedido_idx        ON public.reservas_stock (pedido_id);
CREATE INDEX IF NOT EXISTS reservas_stock_stock_estado_idx  ON public.reservas_stock (stock_id, estado);

CREATE TABLE IF NOT EXISTS public.reglas_insumo (
  id        text PRIMARY KEY,
  tenant_id text NOT NULL DEFAULT 'sendero3d',
  modelo_id text NOT NULL REFERENCES public.modelos(id) ON DELETE CASCADE,
  requiere  text[] NOT NULL DEFAULT '{}',
  stock_id  text NOT NULL REFERENCES public.stock(id) ON DELETE CASCADE,
  cantidad  integer NOT NULL DEFAULT 1,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reglas_insumo_tenant_modelo_idx ON public.reglas_insumo (tenant_id, modelo_id);

ALTER TABLE public.reservas_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_insumo  ENABLE ROW LEVEL SECURITY;
