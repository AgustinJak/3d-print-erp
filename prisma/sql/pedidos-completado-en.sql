-- Cuándo se completó (se cobró) cada pedido (2026-11-02).
--
-- El panel y Finanzas tomaban `updated_at` como fecha de completado: editar un pedido viejo
-- lo pasaba al mes actual. El trigger la pone sola en cualquier camino que pase un pedido a
-- COMPLETADO (webhooks, sync de ML, edición a mano, el cierre de liquidaciones), y la borra si
-- sale de ese estado. Quien ya sabe la fecha (la liquidación de ML) la manda y se respeta.
-- Las fechas del ERP son `timestamp` sin zona, en UTC, como las escribe Prisma.
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS completado_en timestamp(3);

CREATE OR REPLACE FUNCTION public.pedidos_completado_en() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'COMPLETADO' THEN
    IF TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'COMPLETADO' THEN
      NEW.completado_en := COALESCE(NEW.completado_en, timezone('utc', now()));
    END IF;
  ELSE
    NEW.completado_en := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pedidos_completado_en ON public.pedidos;
CREATE TRIGGER pedidos_completado_en
  BEFORE INSERT OR UPDATE OF estado, completado_en ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.pedidos_completado_en();

-- Los que ya estaban completados: los de ML se cobran en la liquidación; el resto, lo mejor
-- que hay es la última modificación.
UPDATE public.pedidos
SET completado_en = CASE
  WHEN fecha_liquidacion_ml IS NOT NULL AND fecha_liquidacion_ml <= updated_at THEN fecha_liquidacion_ml
  ELSE updated_at
END
WHERE estado = 'COMPLETADO' AND completado_en IS NULL;

CREATE INDEX IF NOT EXISTS pedidos_tenant_completado_en ON public.pedidos (tenant_id, completado_en);
