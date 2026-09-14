-- ============================================================================
-- La receta del costo viaja de Bodega al ERP
--
-- Hasta ahora Bodega guardaba en `models.costData` el RESULTADO de la
-- calculadora: una foto con fecha. El problema es que la foto no se entera de
-- nada. Los costos guardados van de marzo a septiembre, calculados con el
-- filamento entre $16.000 y $16.500 el kilo, cuando hoy está a $18.300. Subir
-- el precio obligaba a reabrir la calculadora modelo por modelo.
--
-- Así que lo que viaja no es el número: son los ingredientes.
--
--   gramos + tiempo de impresión + insumos   (por modelo)
--   precio del filamento, luz, desgaste...   (una vez, para todos)
--
-- Con eso el ERP calcula el costo con los valores del momento, y cambiar el
-- precio del filamento en un solo lugar mueve todos los costos a la vez. Que es
-- exactamente para lo que se hizo esto.
--
-- `costData` se queda donde está: deja de ser la verdad y pasa a ser historial
-- —qué te costaba en marzo— que es para lo único que sirve una foto.
-- ============================================================================

-- 1) La receta, al lado del modelo de Bodega ------------------------------
alter table bodega.models add column if not exists filament_grams     double precision;
alter table bodega.models add column if not exists print_time_seconds integer;
alter table bodega.models add column if not exists insumos            numeric(12,2);

comment on column bodega.models.filament_grams     is 'Gramos de filamento que consume una unidad.';
comment on column bodega.models.print_time_seconds is 'Tiempo de impresión de una unidad, en segundos.';
comment on column bodega.models.insumos            is 'Lo que se le agrega después de imprimir (cuerda, imanes, etc.).';

-- 2) Los parámetros de la calculadora, una sola fila para toda la cuenta ---
--
-- Una fila y no una por modelo: el precio del filamento es del taller, no de la
-- katana. El check lo deja explícito para que nadie intente versionarlo acá.
create table if not exists bodega.cost_settings (
  id               text          primary key default 'default',
  precio_kg        numeric(12,2) not null,
  precio_kwh       numeric(12,2) not null,
  consumo_w        numeric(12,2) not null,
  desgaste_horas   numeric(12,2) not null,
  precio_repuestos numeric(12,2) not null,
  margen_error     numeric(12,2) not null,
  updated_at       timestamptz   not null default now(),
  constraint cost_settings_una_sola_fila check (id = 'default')
);

-- Invariante del proyecto: toda tabla nueva arranca con RLS encendida. Prisma
-- se conecta como `postgres` y la bypasea; la publishable key que Bodega lleva
-- incrustada en el .exe queda sujeta a la policy.
alter table bodega.cost_settings enable row level security;

drop policy if exists cost_settings_auth_all on bodega.cost_settings;
create policy cost_settings_auth_all on bodega.cost_settings
  for all to authenticated using (true) with check (true);

-- 3) Lo que ve PostgREST ---------------------------------------------------
--
-- Mismo patrón que las vistas que ya existen: `security_invoker = true`, así la
-- RLS de la tabla se evalúa con el rol de quien llama y no con el del dueño.
create or replace view public.bodega_models with (security_invoker = true) as
  select id, name, category, category_color, stock, updated_at,
         filament_grams, print_time_seconds, insumos
  from bodega.models;

create or replace view public.bodega_cost_settings with (security_invoker = true) as
  select id, precio_kg, precio_kwh, consumo_w, desgaste_horas,
         precio_repuestos, margen_error, updated_at
  from bodega.cost_settings;

grant select, insert, update, delete on bodega.cost_settings        to authenticated;
grant select, insert, update, delete on public.bodega_cost_settings to authenticated;
revoke all on bodega.cost_settings        from anon;
revoke all on public.bodega_cost_settings from anon;
