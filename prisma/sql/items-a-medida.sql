-- Líneas de pedido sin modelo: trabajos a medida del Shop (`personalizado: true`)
-- y productos del Shop que no coinciden con el catálogo. No reservan ni
-- descuentan stock; se muestran con su descripción.
--
-- Compatible hacia atrás: las filas con modelo_id nulo sólo las crea el código
-- que ya sabe leerlas. Aplicado en producción el 2026-10-18.
ALTER TABLE public.items_pedido ALTER COLUMN modelo_id DROP NOT NULL;
ALTER TABLE public.items_pedido ADD COLUMN IF NOT EXISTS descripcion text;
