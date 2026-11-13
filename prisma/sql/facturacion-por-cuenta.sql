-- Finanzas por cuenta de ML (docs/sdd/010 TASK-006 y 011): de qué cuenta es cada cargo de la
-- facturación, cada período y cada bonificación Flex. null / '' = la cuenta principal.

-- Paso 1 (antes de desplegar, aditivo: lo desplegado antes no lee estas columnas).
ALTER TABLE public.cargos_ml   ADD COLUMN IF NOT EXISTS cuenta_ml_id text;
ALTER TABLE public.flex_ml     ADD COLUMN IF NOT EXISTS cuenta_ml_id text;
ALTER TABLE public.periodos_ml ADD COLUMN IF NOT EXISTS cuenta_ml_id text NOT NULL DEFAULT '';
-- El código nuevo identifica el período con la cuenta: necesita este único para su upsert.
CREATE UNIQUE INDEX IF NOT EXISTS periodos_ml_con_cuenta_key ON public.periodos_ml (tenant_id, clave, grupo, cuenta_ml_id);

-- Paso 2 (después de desplegar): la clave primaria pasa a incluir la cuenta, así dos cuentas
-- pueden tener el mismo período. Hasta entonces la otra cuenta no puede guardar un período que ya
-- tenga la principal (Sendero Shop no tenía ninguno el 2026-11-13).
-- ALTER TABLE public.periodos_ml DROP CONSTRAINT periodos_ml_pkey;
-- ALTER TABLE public.periodos_ml ADD CONSTRAINT periodos_ml_pkey PRIMARY KEY USING INDEX periodos_ml_con_cuenta_key;
