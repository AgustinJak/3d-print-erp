-- Lo que factura Mercado Libre, línea por línea (docs/sdd/007). Sólo lo que no está ya dentro del
-- neto de cada venta: publicidad, percepciones y otros cargos. Se lee de /billing/integration.
create table if not exists public.cargos_ml (
  detalle_id    text primary key,
  tenant_id     text not null default 'sendero3d',
  periodo       text not null,
  grupo         text not null,
  tipo          text not null,
  clase         text not null check (clase in ('publicidad', 'percepcion', 'otro')),
  concepto      text not null,
  bonificacion  boolean not null default false,
  monto         double precision not null,
  -- Cuando ML hizo el cargo, y a qué día corresponde el gasto (Product Ads: el día anterior).
  fecha         timestamp(3) not null,
  dia_gasto     text not null,
  bonifica_id   text,
  campana_id    bigint,
  campana       text,
  creado_en     timestamp(3) not null default now()
);
create index if not exists cargos_ml_por_dia on public.cargos_ml (tenant_id, dia_gasto);
create index if not exists cargos_ml_por_periodo on public.cargos_ml (tenant_id, periodo, clase);
alter table public.cargos_ml enable row level security;

create table if not exists public.periodos_ml (
  tenant_id     text not null default 'sendero3d',
  clave         text not null,
  grupo         text not null,
  estado        text not null,
  total         double precision not null default 0,
  resumen       jsonb,
  lineas_total  integer not null default 0,
  completo      boolean not null default false,
  leido_en      timestamp(3) not null default now(),
  primary key (tenant_id, clave, grupo)
);
alter table public.periodos_ml enable row level security;
