-- docs/sdd/005-publicidad-ml: lo que se cambió en Product Ads de Mercado Libre, desde la página
-- Publicidad o desde una sesión de Claude por el MCP local. Se aplica a mano, como el resto de
-- prisma/sql/. Aditivo: no toca nada existente.

create table if not exists public.cambios_publicidad (
  id          text primary key,
  tenant_id   text not null default 'sendero3d',
  tipo        text not null check (tipo in ('campana', 'anuncio')),
  -- id de la campaña o del ad group en ML
  objetivo_id text not null,
  nombre      text,
  -- sólo los campos que cambian
  antes       jsonb,
  despues     jsonb not null,
  estado      text not null check (estado in ('aplicado', 'error')),
  -- lo que contestó ML, o el error
  respuesta   jsonb,
  origen      text not null check (origen in ('pantalla', 'claude')),
  usuario     text,
  creado_en   timestamptz not null default now()
);
create index if not exists cambios_publicidad_por_objetivo on public.cambios_publicidad (tenant_id, tipo, objetivo_id, creado_en desc);

-- Como el resto del ERP: RLS prendido y sin políticas (sólo entra el service role de Prisma).
alter table public.cambios_publicidad enable row level security;
