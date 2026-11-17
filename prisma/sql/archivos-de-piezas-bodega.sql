-- docs/sdd/014 (modelos en el ERP), etapa 3: la Bodega baja el archivo de cada pieza con su propia
-- sesión. Mismo criterio que bodega-stock.sql: la lectura va por una función `security definer`
-- (las tablas tienen RLS sin políticas) y el EXECUTE es sólo para `authenticated`, nunca para
-- `anon`, porque la publishable key viaja dentro del .exe.
--
-- Más estricto que bodega-stock.sql: además de tener sesión, el usuario tiene que ser de Sendero
-- 3D (en la base también están la cuenta demo y Shay Juguetes).
--
-- Prisma no maneja funciones ni políticas: esto se aplica a mano contra Supabase.

-- ¿El usuario de esta sesión es de Sendero 3D?
create or replace function public.bodega_es_del_taller()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles p
    where p.user_id = (select auth.uid())::text and p.tenant_id = 'sendero3d'
  );
$$;

-- El archivo de cada pieza, con su placa: lo que la Bodega necesita para saber qué bajar y si
-- cambió (tamaño, sha256, fecha).
create or replace function public.bodega_archivos_de_piezas()
returns table (
  bodega_model_id text,
  archivo_id text,
  placa int,
  placa_nombre text,
  placa_miniatura text,
  nombre text,
  tamano bigint,
  hash text,
  actualizado_en timestamptz,
  ruta text,
  miniatura_ruta text
)
language sql
stable
security definer
set search_path = ''
as $$
  select pa.bodega_model_id, a.id, pa.placa,
         (select p->>'nombre' from jsonb_array_elements(coalesce(a.placas, '[]'::jsonb)) p where (p->>'n')::int = pa.placa),
         (select p->>'miniatura' from jsonb_array_elements(coalesce(a.placas, '[]'::jsonb)) p where (p->>'n')::int = pa.placa),
         a.nombre, a.tamano, a.hash, greatest(a.actualizado_en, pa.actualizado_en), a.ruta, a.miniatura_ruta
  from public.piezas_archivo pa
  join public.archivos_3d a on a.id = pa.archivo_id
  where a.subido and pa.tenant_id = 'sendero3d' and public.bodega_es_del_taller();
$$;

revoke all on function public.bodega_es_del_taller() from public, anon;
grant execute on function public.bodega_es_del_taller() to authenticated;
revoke all on function public.bodega_archivos_de_piezas() from public, anon;
grant execute on function public.bodega_archivos_de_piezas() to authenticated;

-- ¿Este objeto del bucket es de un archivo enganchado a alguna pieza? La ruta es
-- `<tenant>/<id del archivo>/<nombre>`: el archivo, su miniatura y las de sus placas.
create or replace function public.bodega_puede_bajar(objeto text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.bodega_es_del_taller()
     and split_part(objeto, '/', 1) = 'sendero3d'
     and exists (select 1 from public.piezas_archivo pa where pa.archivo_id = split_part(objeto, '/', 2));
$$;
revoke all on function public.bodega_puede_bajar(text) from public, anon;
grant execute on function public.bodega_puede_bajar(text) to authenticated;

-- Firmar un link de descarga necesita poder leer el objeto. Sólo eso: sin escribir ni borrar, y
-- la biblioteca suelta (archivos sin pieza) sigue siendo sólo del servidor.
drop policy if exists "bodega baja archivos de piezas" on storage.objects;
create policy "bodega baja archivos de piezas" on storage.objects
  for select to authenticated
  using (bucket_id = 'archivos-3d' and public.bodega_puede_bajar(name));
