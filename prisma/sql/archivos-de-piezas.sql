-- docs/sdd/014 (modelos en el ERP), etapa 1: el archivo de cada pieza de Bodega vive en la
-- biblioteca privada (archivos_3d, bucket `archivos-3d`). Aditivo: nada existente cambia.

-- Para no subir dos veces lo mismo y para que la Bodega sepa si cambió sin bajarlo.
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS hash text;  -- sha256 del archivo
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();
-- Las placas leídas del 3MF: [{ "n": 1, "nombre": "", "miniatura": "<ruta png>",
--   "gramos": null, "segundos": null }]. null en un STL o si no se leyó.
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS placas jsonb;
CREATE INDEX IF NOT EXISTS archivos_3d_hash ON public.archivos_3d (tenant_id, hash) WHERE hash IS NOT NULL;

-- Qué archivo (y qué placa) es cada pieza. Un archivo puede ser de varias piezas (los colores
-- comparten modelo; un 3MF puede tener una placa por diseño); una pieza, de a lo sumo uno.
-- Sin FK a bodega.models, igual que stock.bodega_model_id: la pieza puede llegar después.
CREATE TABLE IF NOT EXISTS public.piezas_archivo (
  bodega_model_id text PRIMARY KEY,
  tenant_id       text NOT NULL DEFAULT 'sendero3d',
  archivo_id      text NOT NULL REFERENCES public.archivos_3d(id) ON DELETE CASCADE,
  placa           integer,  -- null = el archivo entero
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS piezas_archivo_archivo ON public.piezas_archivo (archivo_id);

-- Sólo la usa el servidor (service role), como el resto de la biblioteca.
ALTER TABLE public.piezas_archivo ENABLE ROW LEVEL SECURITY;
