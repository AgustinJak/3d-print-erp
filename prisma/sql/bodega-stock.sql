-- ─────────────────────────────────────────────────────────────────────────────
-- Puerta de Bodega al stock del ERP
--
-- Bodega 3D es una app de escritorio que lleva la publishable key incrustada en
-- el .exe, y ese .exe se descarga de un repo público. Por eso NO puede tocar
-- `public.stock` directo: las tablas tienen RLS activado y cero policies, igual
-- que el resto del ERP.
--
-- Ojo con esto: con RLS on y sin policies, un SELECT no da error — devuelve
-- lista vacía. Si Bodega leyera así, creería que no hay nada mapeado, en
-- silencio y para siempre. De ahí que la LECTURA también vaya por una función.
--
-- Las dos son `security definer` con `search_path` vacío, y el EXECUTE está
-- concedido sólo a `authenticated`: `anon` y PUBLIC quedan revocados, porque la
-- anon key es justamente la que viaja dentro del ejecutable.
--
-- Prisma no maneja funciones, así que esto se aplica a mano contra Supabase.
-- Vive acá para que no exista únicamente dentro de la base.
--
-- Ver: Cerebro Sendero 3D → "BOD - Stock en el ERP"
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.bodega_mover_stock(
  p_stock_id      text,
  p_delta         int,
  p_motivo        text default 'produccion',
  p_nota          text default null,
  p_movimiento_id text default null
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  text := coalesce(p_movimiento_id, gen_random_uuid()::text);
  v_cant int;
begin
  -- Idempotencia: Bodega reintenta con el mismo id, no tiene que sumar dos veces.
  if exists (select 1 from public.movimientos_stock m where m.id = v_id) then
    select s.cantidad into v_cant from public.stock s where s.id = p_stock_id;
    return v_cant;
  end if;

  -- Sin greatest(0, ...) a propósito: un negativo significa que se vendió algo
  -- que no estaba registrado y conviene que se vea. Además mantiene
  -- cantidad = suma de los deltas, reconciliable contra movimientos_stock.
  update public.stock s
     set cantidad = s.cantidad + p_delta,
         updated_at = now()
   where s.id = p_stock_id
   returning s.cantidad into v_cant;

  if v_cant is null then
    raise exception 'stock % inexistente', p_stock_id;
  end if;

  insert into public.movimientos_stock (id, stock_id, delta, motivo, nota)
  values (v_id, p_stock_id, p_delta, p_motivo, p_nota);

  return v_cant;
end;
$$;

create or replace function public.bodega_unidades_stock()
returns table (id text, etiqueta text, cantidad int, minimo int, bodega_model_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.etiqueta, s.cantidad, s.minimo, s.bodega_model_id
  from public.stock s
  where s.tenant_id = 'sendero3d';
$$;

-- Permisos: sólo quien inició sesión puede llamarlas.
revoke all on function public.bodega_mover_stock(text,int,text,text,text) from public, anon;
grant execute on function public.bodega_mover_stock(text,int,text,text,text) to authenticated;

revoke all on function public.bodega_unidades_stock() from public, anon;
grant execute on function public.bodega_unidades_stock() to authenticated;

-- RLS: mismo criterio que las otras 18 tablas del ERP — activado y sin policies.
-- Prisma se conecta como postgres y lo bypasea, así que la app no se entera.
alter table public.stock              enable row level security;
alter table public.movimientos_stock  enable row level security;
alter table public.transferencias     enable row level security;
alter table public.webhook_logs       enable row level security;
alter table public._prisma_migrations enable row level security;
