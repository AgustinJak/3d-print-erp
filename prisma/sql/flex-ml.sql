-- Las bonificaciones Flex que entraron de verdad a Mercado Pago (docs/sdd/007). Cada una es una
-- transferencia `bonificaciones_flex_fc` que dice de qué envío es (reference_id).
create table if not exists public.flex_ml (
  pago_id     text primary key,
  tenant_id   text not null default 'sendero3d',
  fecha       timestamp(3) not null,
  dia         text not null,
  monto       double precision not null,
  envio_id    text,
  pedido_id   text,
  -- El envío no es de ningún pedido del ERP: de Shay, o de una venta que no entró.
  de_otro     boolean not null default false,
  revisado    boolean not null default false,
  creado_en   timestamp(3) not null default now()
);
create index if not exists flex_ml_por_dia on public.flex_ml (tenant_id, dia);
alter table public.flex_ml enable row level security;
