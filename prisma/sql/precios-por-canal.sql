-- Precios por canal (docs/sdd/003, specs 004 y 005).
--
-- Aditivo: el código desplegado no lee nada de esto. Aplicado en producción el 2026-10-24.

-- Lo último que se leyó del canal para cada clave. `precio_publicado` es el precio que puso
-- el vendedor (en ML, el standard: lo que el ERP escribe); `precio_lectura` guarda lo que
-- decide si se puede tocar: estado, promoción activa y lo que paga el cliente con ella,
-- automatización de precios, variaciones y catálogo.
alter table public.mapeos_canal
  add column if not exists precio_publicado double precision,
  add column if not exists precio_leido_en  timestamptz,
  add column if not exists precio_lectura   jsonb;

-- Cada precio que el ERP aplicó, o intentó aplicar, en un canal.
create table if not exists public.cambios_precio (
  id             text primary key,
  tenant_id      text not null default 'sendero3d',
  canal          text not null check (canal in ('mercadolibre', 'shop', 'erp')),
  -- la de mapeos_canal; en 'erp', el id del modelo o "variante:<id>"
  clave          text not null,
  combinacion_id text references public.combinaciones(id) on delete set null,
  antes          double precision,
  despues        double precision not null,
  estado         text not null check (estado in ('aplicado', 'rechazado', 'error')),
  -- lo que contestó el canal, o el motivo por el que no se mandó
  respuesta      jsonb,
  usuario        text,
  creado_en      timestamptz not null default now()
);
create index if not exists cambios_precio_por_clave on public.cambios_precio (tenant_id, canal, clave, creado_en desc);

-- Como el resto del ERP: RLS prendido y sin políticas (sólo entra el service role de Prisma).
alter table public.cambios_precio enable row level security;
