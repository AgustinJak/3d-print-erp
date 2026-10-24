-- docs/sdd/003-precios-desde-bodega, specs 001 y 002 (TASK-001, parte de Bodega).
--
-- Bodega sube su catálogo de materiales y, por modelo, el material y la política de precio
-- (margen, redondeo, promo de ML) con una foto de los tres precios. También los gastos de
-- venta de la calculadora, junto a los parámetros de costo.
--
-- Aditivo: nada de lo que corre hoy lee estas columnas. Se aplica ANTES de instalar la Bodega
-- que las manda: la sincronización sube los modelos con un POST que nombra cada columna, y
-- PostgREST rechaza el pedido entero si una no existe.

create table if not exists bodega.materials (
  id          text primary key,               -- uuid generado en Bodega
  nombre      text not null,                  -- "GST3D PLA"
  precio_kg   numeric not null check (precio_kg > 0),
  por_defecto boolean not null default false,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now()
);
-- Un único material por defecto.
create unique index if not exists materials_un_defecto on bodega.materials ((true)) where por_defecto;

alter table bodega.materials enable row level security;
drop policy if exists materials_auth_all on bodega.materials;
create policy materials_auth_all on bodega.materials
  for all to authenticated using (bodega.is_allowed()) with check (bodega.is_allowed());
grant select, insert, update, delete on bodega.materials to authenticated;

drop trigger if exists trg_materials_touch on bodega.materials;
create trigger trg_materials_touch before insert or update on bodega.materials
  for each row execute function bodega.touch_updated_at();

alter table bodega.models
  add column if not exists material_id text,    -- null = el por defecto
  add column if not exists margen      numeric,  -- % ; null = el general
  add column if not exists redondeo    text,     -- exacto|cien|quinientos|mil|noventa; null = el general
  add column if not exists promo_ml    numeric,  -- % ; null = el general
  add column if not exists precios     jsonb;    -- foto de los tres precios al guardarlos

alter table bodega.cost_settings
  add column if not exists gastos_venta jsonb;   -- GastosVenta + redondeo general

-- Las vistas por las que escribe Bodega suman las columnas al final. `security_invoker` se
-- repite a propósito: es lo que hace que la vista respete el RLS de la tabla.
create or replace view public.bodega_models with (security_invoker = true) as
  select id, name, category, category_color, stock, updated_at, filament_grams,
         print_time_seconds, insumos, material_id, margen, redondeo, promo_ml, precios
  from bodega.models;

create or replace view public.bodega_cost_settings with (security_invoker = true) as
  select id, precio_kg, precio_kwh, consumo_w, desgaste_horas, precio_repuestos, margen_error,
         updated_at, gastos_venta
  from bodega.cost_settings;

create or replace view public.bodega_materials with (security_invoker = true) as
  select id, nombre, precio_kg, por_defecto, activo, updated_at from bodega.materials;
grant select, insert, update, delete, references, trigger, truncate on public.bodega_materials to authenticated, service_role;
-- Supabase le da todo a `anon` en lo nuevo de `public` (default privileges); las otras vistas
-- de Bodega no lo tienen.
revoke all on public.bodega_materials from anon;
revoke all on bodega.materials from anon;
