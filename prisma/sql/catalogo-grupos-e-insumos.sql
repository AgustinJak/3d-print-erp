-- Grupos de variantes, su tipo y la marca de insumo (docs/sdd/004, specs 003 y 006).
--
-- Aditivo: los pedidos viejos y el código desplegado no cambian. Va en dos pasos:
--
--   1. Las columnas, vacías (esta parte).
--   2. El relleno con scripts/sdd-004-rellenar-grupos.ts (simula por defecto) y, recién
--      cuando todas las variantes tienen tipo, la parte 2 de abajo.

-- ── Parte 1 ─────────────────────────────────────────────────────────────────

-- "Color", "Funda", "Diseño", "Firma": a qué elección pertenece la opción.
alter table public.variantes_modelo add column if not exists grupo text;

-- pieza      = cada opción se imprime aparte (fila de stock propia, afecta_stock)
-- insumo     = "Con X" descuenta un insumo y "Sin X" no
-- decoracion = misma pieza para todas las opciones
alter table public.variantes_modelo add column if not exists tipo text;
alter table public.variantes_modelo drop constraint if exists variantes_modelo_tipo_valido;
alter table public.variantes_modelo add constraint variantes_modelo_tipo_valido
  check (tipo is null or tipo in ('pieza', 'insumo', 'decoracion'));

-- Una pieza que no se vende sola y que consumen las recetas (las fundas). Sigue inactiva
-- como producto: la marca es lo que la distingue de un producto que dejó de venderse.
alter table public.modelos add column if not exists es_insumo boolean not null default false;

-- ── Parte 2 (después del relleno; la aplica el script, 2026-10-24) ─────────
--
-- alter table public.variantes_modelo alter column tipo set not null;
-- alter table public.variantes_modelo add constraint variantes_modelo_tipo_y_stock
--   check ((tipo = 'pieza') = afecta_stock);

-- ── Parte 3: grupo y tipo por defecto ───────────────────────────────────────
--
-- El ERP desplegado antes de la 004 (el lápiz, "Agregar accesorio") crea variantes sin grupo ni
-- tipo: con la parte 2 fallaría. Este trigger los completa con las mismas reglas del relleno
-- (`tipoDeVariante` y `grupoDeVariante` de src/lib/catalogo.ts). El código nuevo siempre los
-- manda, así que para él no hace nada.
create or replace function public.variantes_modelo_tipo_por_defecto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_resto text;
begin
  if new.tipo is null then
    new.tipo := case
      when new.afecta_stock then 'pieza'
      when new.nombre ~* '^\s*(con|sin)\s+' then 'insumo'
      else 'decoracion'
    end;
  end if;
  if new.grupo is null or btrim(new.grupo) = '' then
    v_resto := btrim(regexp_replace(new.nombre, '^\s*(con|sin)\s+', '', 'i'));
    if new.tipo = 'insumo' and v_resto <> btrim(new.nombre) and v_resto <> '' then
      new.grupo := upper(left(v_resto, 1)) || substr(v_resto, 2);
    else
      new.grupo := 'Variante';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists variantes_modelo_tipo_por_defecto on public.variantes_modelo;
create trigger variantes_modelo_tipo_por_defecto
  before insert on public.variantes_modelo
  for each row execute function public.variantes_modelo_tipo_por_defecto();
