-- De qué cuenta de ML es cada publicación del mapeo (docs/sdd/010, TASK-004). Aplicada el 2026-11-12.
-- null = la principal: todo lo de antes sigue igual. Una cuenta con publicaciones enlazadas no se
-- puede desconectar (esta restricción y el chequeo de /api/ml/disconnect).
ALTER TABLE public.mapeos_canal
  ADD COLUMN IF NOT EXISTS cuenta_ml_id text REFERENCES public.cuentas_ml (id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS mapeos_canal_cuenta_ml_idx ON public.mapeos_canal (cuenta_ml_id) WHERE cuenta_ml_id IS NOT NULL;
