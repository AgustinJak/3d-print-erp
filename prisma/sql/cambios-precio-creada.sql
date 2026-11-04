-- "Crear en ML" guarda cada publicación nueva en cambios_precio con estado 'creada', y la
-- restricción no lo aceptaba: la publicación se creaba en ML y el ERP daba error (2026-11-04).
ALTER TABLE public.cambios_precio DROP CONSTRAINT IF EXISTS cambios_precio_estado_check;
ALTER TABLE public.cambios_precio ADD CONSTRAINT cambios_precio_estado_check
  CHECK (estado = ANY (ARRAY['aplicado'::text, 'rechazado'::text, 'error'::text, 'creada'::text]));
