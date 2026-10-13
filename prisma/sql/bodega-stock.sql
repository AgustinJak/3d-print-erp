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

  -- Si esta pieza era de las que un pedido estaba esperando, ya falta menos.
  --
  -- Esto NO recalcula nada: el reparto de reservas es TypeScript y decide qué
  -- pedido se lleva cada unidad. Acá sólo se resta la consecuencia aritmética
  -- de haber producido, para que la app del celular no siga mostrando "falta 1"
  -- justo después de que la marcaste hecha. El reparto de verdad reescribe la
  -- foto entera en la próxima pasada del ERP.
  --
  -- Sólo con deltas positivos: cuánto vuelve a faltar al restar stock depende
  -- de qué estaba reservado, y eso no se puede decidir desde acá.
  if p_delta > 0 then
    update public.produccion_pendiente p
       set unidades = p.unidades - least(p_delta, p.unidades)
     where p.stock_id = p_stock_id;

    delete from public.produccion_pendiente p
     where p.stock_id = p_stock_id and p.unidades <= 0;
  end if;

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

-- Un modelo de Bodega no puede estar mapeado a dos unidades de stock: al
-- marcarlo producido no se sabría cuál sumar, y se elegiría una en silencio.
create unique index if not exists stock_bodega_model_id_key
  on public.stock (bodega_model_id)
  where bodega_model_id is not null;

create or replace function public.bodega_mapear_modelo(
  p_stock_id        text,
  p_bodega_model_id text default null   -- null desmapea
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $
declare
  v_existe   boolean;
  v_liberado text;
begin
  select true into v_existe from public.stock s where s.id = p_stock_id;
  if v_existe is null then
    raise exception 'unidad de stock % inexistente', p_stock_id;
  end if;

  if p_bodega_model_id is not null
     and not exists (select 1 from bodega.models m where m.id = p_bodega_model_id) then
    raise exception 'modelo de bodega % inexistente', p_bodega_model_id;
  end if;

  -- Re-mapear es la operación normal mientras se ordena el catálogo, así que en
  -- vez de fallar se libera el mapeo anterior. Se devuelve cuál se liberó para
  -- que la UI lo muestre: si se hiciera en silencio, alguien perdería su mapeo
  -- sin enterarse.
  if p_bodega_model_id is not null then
    update public.stock s
       set bodega_model_id = null
     where s.bodega_model_id = p_bodega_model_id
       and s.id <> p_stock_id
    returning s.etiqueta into v_liberado;
  end if;

  update public.stock s
     set bodega_model_id = p_bodega_model_id,
         updated_at = now()
   where s.id = p_stock_id;

  return jsonb_build_object(
    'ok', true,
    'stock_id', p_stock_id,
    'bodega_model_id', p_bodega_model_id,
    'liberado', v_liberado          -- unidad que perdió este modelo, o null
  );
end;
$;

-- La tabla va a mano igual que las funciones: la base real quedó drifteada del
-- schema de Prisma (timestamptz donde Prisma quiere timestamp(3), nombres de FK),
-- así que un `db push` arrastraría ese drift entero en vez de agregar una tabla.
create table if not exists public.produccion_pendiente (
  stock_id       text primary key references public.stock(id) on delete cascade,
  tenant_id      text not null default 'sendero3d',
  unidades       integer not null,
  pedidos        integer not null,
  actualizado_en timestamptz not null default now()
);
create index if not exists produccion_pendiente_tenant_id_idx
  on public.produccion_pendiente (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Qué hay que imprimir porque hay pedidos esperándolo
--
-- La cuenta no se hace acá: la hace el ERP en TypeScript, resolviendo qué fila
-- de stock consume cada item según sus variantes y sumándole las recetas de
-- funda. Esta función sólo lee la foto que deja `reasignarReservas()` en
-- `produccion_pendiente`. Replicar esa lógica en SQL sería tener dos versiones
-- de lo más delicado del ERP, y el día que divergen el taller imprime lo que no
-- va.
--
-- Devuelve jsonb y no una tabla a propósito: hace falta poder decir CUÁNDO se
-- calculó incluso cuando no falta nada, y una tabla vacía no puede. Sin eso,
-- "no falta nada" y "esto nunca corrió" se ven igual en el celular.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.bodega_pendiente_produccion()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'calculado_en', (
      select c.data->>'repartoEn' from public.config_tenant c
       where c.tenant_id = 'sendero3d'
    ),
    'filas', coalesce((
      select jsonb_agg(f order by f->>'etiqueta')
      from (
        select jsonb_build_object(
                 'stock_id',        s.id,
                 'bodega_model_id', s.bodega_model_id,
                 'etiqueta',        coalesce(s.etiqueta, m.nombre),
                 'unidades',        p.unidades,
                 'pedidos',         p.pedidos,
                 'cantidad',        s.cantidad
               ) as f
          from public.produccion_pendiente p
          join public.stock  s on s.id = p.stock_id
          join public.modelos m on m.id = s.modelo_id
         where p.tenant_id = 'sendero3d'
      ) q
    ), '[]'::jsonb)
  );
$$;

-- Permisos: sólo quien inició sesión puede llamarlas.
revoke all on function public.bodega_mover_stock(text,int,text,text,text) from public, anon;
grant execute on function public.bodega_mover_stock(text,int,text,text,text) to authenticated;

revoke all on function public.bodega_unidades_stock() from public, anon;
grant execute on function public.bodega_unidades_stock() to authenticated;
revoke all on function public.bodega_mapear_modelo(text,text) from public, anon;
grant execute on function public.bodega_mapear_modelo(text,text) to authenticated;
revoke all on function public.bodega_pendiente_produccion() from public, anon;
grant execute on function public.bodega_pendiente_produccion() to authenticated;

-- RLS: mismo criterio que las otras 18 tablas del ERP — activado y sin policies.
-- Prisma se conecta como postgres y lo bypasea, así que la app no se entera.
alter table public.stock                 enable row level security;
alter table public.produccion_pendiente  enable row level security;
alter table public.movimientos_stock     enable row level security;
alter table public.transferencias     enable row level security;
alter table public.webhook_logs       enable row level security;
alter table public._prisma_migrations enable row level security;
