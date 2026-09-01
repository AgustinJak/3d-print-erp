-- El costo se parte en dos: imprimir la pieza, y lo que se le agrega después.
-- Son dos cosas que cambian por separado (el filamento sube distinto que la
-- cuerda), así que tenerlas juntas obligaba a recalcular a mano.
ALTER TABLE public.modelos
  ADD COLUMN IF NOT EXISTS costo_insumos double precision NOT NULL DEFAULT 0;

ALTER TABLE public.variantes_modelo
  ADD COLUMN IF NOT EXISTS costo_insumos_adicional double precision NOT NULL DEFAULT 0;
