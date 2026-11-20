-- docs/sdd/016-tendencias-por-tema — temas, búsquedas de ML y el calendario por tema.
-- Aditivo: no borra ni renombra nada. sugerencias_producto queda sin uso y se borra más adelante.

CREATE TABLE IF NOT EXISTS public.temas (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  nombre      text NOT NULL,
  -- anime, pelicula, serie, kpop, musica, juego, personaje, deporte, otro
  tipo        text NOT NULL DEFAULT 'otro',
  -- Normalizados (sin mayúsculas ni tildes). Juntan las series de los productos y las búsquedas.
  alias       text[] NOT NULL DEFAULT '{}',
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS temas_tenant_nombre ON public.temas (tenant_id, lower(nombre));

-- La foto diaria de GET /trends/MLA/{categoría}: una fila por categoría, palabra y día.
CREATE TABLE IF NOT EXISTS public.busquedas_ml (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id    text NOT NULL DEFAULT 'sendero3d',
  categoria_id text NOT NULL,          -- 'MLA' = todo el sitio
  categoria    text,                   -- el nombre, para mostrar
  palabra      text NOT NULL,
  normalizada  text NOT NULL,
  posicion     int  NOT NULL,          -- 1 a 50
  url          text,
  dia          date NOT NULL,
  CONSTRAINT busquedas_ml_unica UNIQUE (tenant_id, categoria_id, normalizada, dia)
);
CREATE INDEX IF NOT EXISTS busquedas_ml_dia ON public.busquedas_ml (tenant_id, dia DESC);

-- Palabras que Agustín descartó: no vuelven a "Búsquedas nuevas".
CREATE TABLE IF NOT EXISTS public.busquedas_descartadas (
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  normalizada text NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, normalizada)
);

ALTER TABLE public.eventos_tendencia
  ADD COLUMN IF NOT EXISTS tema_id   text REFERENCES public.temas(id) ON DELETE SET NULL,
  -- El estreno en Argentina (TMDB release_dates, tipos 2 y 3), si lo hay.
  ADD COLUMN IF NOT EXISTS fecha_ar  timestamptz,
  -- Las fechas comerciales se repiten cada año: la vista calcula la próxima.
  ADD COLUMN IF NOT EXISTS anual     boolean NOT NULL DEFAULT false,
  -- A los 7 días de pasado deja de verse.
  ADD COLUMN IF NOT EXISTS archivado boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS eventos_tendencia_tema ON public.eventos_tendencia (tema_id);

-- Sólo el servidor (Prisma) lee y escribe, como ajustes_precio.
ALTER TABLE public.temas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busquedas_ml ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busquedas_descartadas ENABLE ROW LEVEL SECURITY;
