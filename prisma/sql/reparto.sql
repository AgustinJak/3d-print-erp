-- docs/sdd/018-reparto-con-mensajeria — el repartidor de Flex y de la mensajería de la web.
-- Aditivo. Sin direcciones: la de un Flex se lee de ML al abrir el link; la de la web, del pedido.

CREATE TABLE IF NOT EXISTS public.zonas_reparto (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  nombre      text NOT NULL,
  -- Lo que se le paga al repartidor por envío entregado.
  precio      numeric NOT NULL,
  -- Normalizados (sin mayúsculas ni tildes).
  partidos    text[] NOT NULL DEFAULT '{}',
  -- Localidades que el mapa nombra sueltas y ganan sobre su partido (Tristán Suárez es de Ezeiza).
  localidades text[] NOT NULL DEFAULT '{}',
  -- Como en la web: "1000-1499, 1602".
  codigos_postales text,
  orden       int NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Localidad → partido, lo que contestó georef (o lo que se corrigió a mano), para no preguntar de nuevo.
CREATE TABLE IF NOT EXISTS public.localidades_reparto (
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  normalizada text NOT NULL,
  partido     text,
  fuente      text NOT NULL DEFAULT 'georef',   -- georef | manual
  creado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, normalizada)
);

CREATE TABLE IF NOT EXISTS public.hojas_reparto (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  dia         date NOT NULL,                  -- hora argentina
  -- sha256 del link. El link no se guarda: si se vuelve a mandar, se genera otro.
  token_hash  text UNIQUE,
  vence       timestamptz,
  enviado_en  timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hojas_reparto_dia UNIQUE (tenant_id, dia)
);

CREATE TABLE IF NOT EXISTS public.liquidaciones_reparto (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  desde       date NOT NULL,                  -- lunes
  hasta       date NOT NULL,                  -- domingo
  envios      int NOT NULL,
  total       numeric NOT NULL,
  pagado_en   timestamptz NOT NULL DEFAULT now(),
  usuario     text,
  CONSTRAINT liquidaciones_reparto_semana UNIQUE (tenant_id, desde)
);

CREATE TABLE IF NOT EXISTS public.envios_reparto (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  hoja_id     text NOT NULL REFERENCES public.hojas_reparto(id) ON DELETE CASCADE,
  pedido_id   text NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  origen      text NOT NULL,                  -- flex | web
  envio_ml    text,
  zona_id     text REFERENCES public.zonas_reparto(id) ON DELETE SET NULL,
  zona_nombre text,
  -- Fijo al ofrecerlo (RN-2): si cambia la tarifa, lo ya ofrecido no cambia.
  precio      numeric,
  -- ofrecido | tomado | rechazado | entregado | no_entregado
  estado      text NOT NULL DEFAULT 'ofrecido',
  motivo      text,
  marcado_en  timestamptz,
  liquidacion_id text REFERENCES public.liquidaciones_reparto(id) ON DELETE SET NULL,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT envios_reparto_unico UNIQUE (hoja_id, pedido_id)
);
CREATE INDEX IF NOT EXISTS envios_reparto_estado ON public.envios_reparto (tenant_id, estado, marcado_en);

ALTER TABLE public.zonas_reparto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localidades_reparto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hojas_reparto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidaciones_reparto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.envios_reparto ENABLE ROW LEVEL SECURITY;

-- Las zonas de SyB Logística (imagen de Agustín, 2026-11-23). La Matanza va en las dos zonas:
-- la resuelve el código por localidad (lib/zonas-reparto.ts).
INSERT INTO public.zonas_reparto (nombre, precio, partidos, localidades, codigos_postales, orden)
SELECT * FROM (VALUES
  ('CABA', 4000::numeric, ARRAY['caba','capital federal','ciudad autonoma de buenos aires'], ARRAY[]::text[], '1000-1499', 1),
  ('Zona 1', 5800::numeric, ARRAY['san fernando','san isidro','vicente lopez','general san martin','san martin','tres de febrero','hurlingham','ituzaingo','moron','la matanza','avellaneda','lanus','lomas de zamora'], ARRAY[]::text[], NULL, 2),
  ('Zona 2', 8200::numeric, ARRAY['tigre','malvinas argentinas','jose c paz','san miguel','moreno','merlo','quilmes','berazategui','florencio varela','almirante brown','esteban echeverria','ezeiza'], ARRAY['gonzalez catan','virrey del pino','20 de junio','veinte de junio','isidro casanova','rafael castillo','gregorio de laferrere','laferrere','ciudad evita'], '1755,1757,1759,1761,1763,1765,1778', 3),
  ('Zona 3', 9100::numeric, ARRAY['zarate','campana','escobar','pilar','lujan','general rodriguez','marcos paz','presidente peron','san vicente','canuelas','ensenada','berisso','la plata'], ARRAY['guernica','alejandro korn','korn','tristan suarez'], NULL, 4)
) AS z(nombre, precio, partidos, localidades, codigos_postales, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.zonas_reparto WHERE tenant_id = 'sendero3d');

-- 2026-11-25: La Matanza Sur (el mapa de SyB parte La Matanza en dos). ML suele dar "La Matanza" como
-- localidad; el CP dice cuál. SyB cobró Isidro Casanova (1765) como sur. Ya aplicado en producción.
update zonas_reparto
   set localidades = array['gonzalez catan','virrey del pino','20 de junio','veinte de junio','isidro casanova','rafael castillo','gregorio de laferrere','laferrere','ciudad evita'],
       codigos_postales = '1755,1757,1759,1761,1763,1765,1778'
 where tenant_id = 'sendero3d' and nombre = 'Zona 2';
