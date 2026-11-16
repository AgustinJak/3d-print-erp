-- Tareas del día y biblioteca de archivos 3D (docs/sdd/012). Tablas nuevas: aditivo.

CREATE TABLE IF NOT EXISTS public.tareas (
  id              text PRIMARY KEY,
  tenant_id       text NOT NULL DEFAULT 'sendero3d',
  titulo          text NOT NULL,
  nota            text,
  -- por_hacer | haciendo | trabada | terminada
  estado          text NOT NULL DEFAULT 'por_hacer',
  -- Orden dentro de la columna (más chico, más arriba).
  orden           double precision NOT NULL DEFAULT 0,
  -- baja | normal | alta
  prioridad       text NOT NULL DEFAULT 'normal',
  -- perfiles.id; null = sin asignar
  responsable_id  text,
  fecha_limite    date,
  motivo_trabada  text,
  -- [{ texto, hecho }]
  pasos           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Cuándo se terminó: la columna Terminadas muestra las de hoy, el historial agrupa por este día.
  terminada_en    timestamptz,
  -- Si salió de una tarea que se repite, cuál y de qué día (no se crea dos veces).
  recurrente_id   text,
  dia_recurrencia date,
  creada_por      text,
  creada_en       timestamptz NOT NULL DEFAULT now(),
  actualizada_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tareas_tenant_estado ON public.tareas (tenant_id, estado);
CREATE INDEX IF NOT EXISTS tareas_tenant_terminada ON public.tareas (tenant_id, terminada_en);
CREATE UNIQUE INDEX IF NOT EXISTS tareas_una_por_recurrencia ON public.tareas (recurrente_id, dia_recurrencia) WHERE recurrente_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tareas_recurrentes (
  id              text PRIMARY KEY,
  tenant_id       text NOT NULL DEFAULT 'sendero3d',
  titulo          text NOT NULL,
  nota            text,
  -- diaria | semanal | mensual
  frecuencia      text NOT NULL,
  -- semanal: días de la semana (0 = domingo); mensual: días del mes. Vacío en diaria.
  dias            integer[] NOT NULL DEFAULT '{}',
  responsable_id  text,
  prioridad       text NOT NULL DEFAULT 'normal',
  activa          boolean NOT NULL DEFAULT true,
  creada_en       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.archivos_3d (
  id              text PRIMARY KEY,
  tenant_id       text NOT NULL DEFAULT 'sendero3d',
  nombre          text NOT NULL,
  -- Ruta en el bucket privado `archivos-3d`.
  ruta            text NOT NULL,
  tamano          bigint NOT NULL DEFAULT 0,
  -- stl | 3mf | obj | step | ...
  extension       text,
  carpeta         text,
  etiquetas       text[] NOT NULL DEFAULT '{}',
  -- Miniatura generada en el navegador al verlo (png en el mismo bucket).
  miniatura_ruta  text,
  -- false hasta que el navegador termina de subirlo.
  subido          boolean NOT NULL DEFAULT false,
  subido_por      text,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS archivos_3d_tenant ON public.archivos_3d (tenant_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.tarea_archivos (
  tarea_id   text NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  archivo_id text NOT NULL REFERENCES public.archivos_3d(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, archivo_id)
);

-- Las tablas sólo se usan desde el servidor (Prisma, con la conexión del dueño): RLS prendido y
-- sin políticas, así la API pública de Supabase no las expone.
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas_recurrentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archivos_3d ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarea_archivos ENABLE ROW LEVEL SECURITY;

-- El bucket privado: sin políticas; se sube y se baja con links firmados que da el servidor.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('archivos-3d', 'archivos-3d', false, 524288000)
ON CONFLICT (id) DO NOTHING;
