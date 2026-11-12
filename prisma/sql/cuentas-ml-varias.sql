-- Varias cuentas de Mercado Libre por negocio (docs/sdd/010, TASK-001).
--
-- Va en dos pasos, porque el código desplegado antes de este cambio guarda los tokens con un upsert
-- por tenant_id, y sin esa restricción única no puede renovar el token:
--
--   Paso 1 (aditivo, se puede aplicar con el código viejo desplegado): columnas nuevas e índices.
--   Paso 2 (recién con el código nuevo desplegado): sacar el único por tenant_id, para poder conectar
--   una segunda cuenta.

-- ── Paso 1 ──────────────────────────────────────────────────────────────────
ALTER TABLE public.cuentas_ml
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS principal boolean NOT NULL DEFAULT true;

-- Una misma cuenta de ML no se conecta dos veces al mismo negocio.
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_ml_tenant_ml_user_key ON public.cuentas_ml (tenant_id, ml_user_id);
-- Una sola principal por negocio: la de siempre (Sendero 3D).
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_ml_una_principal ON public.cuentas_ml (tenant_id) WHERE principal;

-- ── Paso 2 ──────────────────────────────────────────────────────────────────
-- Aplicado el 2026-11-12, después del deploy f55e269.
ALTER TABLE public.cuentas_ml DROP CONSTRAINT IF EXISTS cuentas_ml_tenant_id_key;
CREATE INDEX IF NOT EXISTS cuentas_ml_tenant_id_idx ON public.cuentas_ml (tenant_id);
