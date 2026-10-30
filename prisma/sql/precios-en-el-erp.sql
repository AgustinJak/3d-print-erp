-- docs/sdd/006-precios-en-el-erp: las decisiones de precio pasan de Bodega al ERP.
--
-- Aditivo: el código desplegado no lee nada de esto. Bodega sigue subiendo lo suyo hasta que la
-- spec 005 lo cambie, y las columnas viejas de bodega.* no se tocan.

-- La configuración general de precios (spec 001): lo que antes era
-- bodega.cost_settings.gastos_venta, más el redondeo. Una fila por tenant.
create table if not exists public.config_precios (
  tenant_id      text primary key,
  -- las claves de GastosVenta (src/lib/precios-formula.ts) más "redondeo"
  gastos         jsonb not null,
  actualizado_en timestamptz not null default now(),
  usuario        text
);

-- Cada cambio de esa configuración (spec 001, REQ-3).
create table if not exists public.cambios_config_precios (
  id         text primary key,
  tenant_id  text not null,
  antes      jsonb,
  despues    jsonb not null,
  usuario    text,
  creado_en  timestamptz not null default now()
);
create index if not exists cambios_config_precios_por_tenant on public.cambios_config_precios (tenant_id, creado_en desc);

-- La política propia de un producto (spec 002) y su categoría de ML (spec 004).
-- null = sigue a la general.
alter table public.modelos
  add column if not exists margen              double precision,
  add column if not exists promo_ml            double precision,
  add column if not exists redondeo            text,
  add column if not exists categoria_ml        text,
  add column if not exists categoria_ml_origen text check (categoria_ml_origen in ('publicacion', 'heredada', 'predicha', 'manual'));

-- Como el resto del ERP: RLS prendido y sin políticas (sólo entra el service role de Prisma).
alter table public.config_precios enable row level security;
alter table public.cambios_config_precios enable row level security;

-- El precio de ML fijo de un producto (spec 002, 2026-10-29): lo que se publica en la opción 1,
-- elegido por Agustín (los porta auriculares en $29.434, para no cruzar los $30.000). La opción 2 se
-- sube hasta dejar lo mismo que deja ese precio. null = el que da la fórmula.
alter table public.modelos add column if not exists precio_ml_fijo double precision;
