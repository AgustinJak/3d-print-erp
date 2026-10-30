-- docs/sdd/006-precios-en-el-erp, spec 010: cada promo de Mercado Libre que se prende, cambia o saca
-- desde el ERP, salga bien o mal. Aditivo: nada de lo desplegado lo lee.
create table if not exists public.cambios_promos (
  id              text primary key,
  tenant_id       text not null,
  mla             text not null,
  combinacion_id  text,
  -- "sumar" | "cambiar" | "sacar"
  accion          text not null,
  promocion_id    text,
  promocion_tipo  text not null,
  -- precio y % antes y después
  antes           jsonb,
  despues         jsonb,
  -- "aplicado" | "sin_efecto" | "rechazado" | "error"
  estado          text not null,
  respuesta       jsonb,
  usuario         text,
  creado_en       timestamptz not null default now()
);
create index if not exists cambios_promos_por_tenant on public.cambios_promos (tenant_id, creado_en desc);
create index if not exists cambios_promos_por_mla on public.cambios_promos (tenant_id, mla, creado_en desc);

-- Como el resto del ERP: RLS prendido y sin políticas (sólo entra el service role de Prisma).
alter table public.cambios_promos enable row level security;

-- La última lectura de promos de cada publicación (spec 010, REQ-1 y REQ-3): en la que está, las
-- pendientes y a cuáles se puede sumar. La escribe "Leer promos de ML" y cada cambio.
create table if not exists public.promos_ml_lectura (
  tenant_id  text not null,
  mla        text not null,
  promos     jsonb not null,
  error      text,
  leido_en   timestamptz not null default now(),
  primary key (tenant_id, mla)
);
alter table public.promos_ml_lectura enable row level security;

-- Cada vez que se prende o apaga Flex desde el ERP (docs/sdd/006, spec 007). "aplicado" =
-- verificado en la publicación (`self_service_in` / `self_service_out`).
create table if not exists public.cambios_flex (
  id         text primary key,
  tenant_id  text not null,
  mla        text not null,
  antes      boolean,
  despues    boolean not null,
  estado     text not null,
  respuesta  jsonb,
  usuario    text,
  creado_en  timestamptz not null default now()
);
create index if not exists cambios_flex_por_tenant on public.cambios_flex (tenant_id, creado_en desc);
alter table public.cambios_flex enable row level security;
