---
feature: 016-tendencias-por-tema
estado: validated
actualizado: 2026-11-20
---

# SDD técnico · Tendencias por tema

## 1. Estado actual

- **Pantalla:** `src/app/(app)/tendencias/page.tsx`, 1200 líneas, un solo client component.
  - Niveles con 🔥 (`ViralFires`, línea 177; selector, líneas 1143-1145) y 📊 en el calendario (línea 974).
  - Botones para sembrar fechas (`/api/tendencias/seed`, línea 658) y sincronizar (`/api/tendencias/sync`, línea 673).
- **Datos:** `EventoTendencia` (`prisma/schema.prisma:292`) y `SugerenciaProducto` (`:314`), con `modeloVinculadoId`.
  - Al 2026-11-20: 239 eventos, todos `activo`.
  - 262 sugerencias, de las que 0 están vinculadas.
- **Fuentes:**
  - `src/lib/tmdb.ts`:
    - Sin `region` (línea 150): la fecha es la mundial.
    - Viralidad por popularidad global más una lista de franquicias (líneas 48-85).
    - Sugerencias por género (`generateSugerencias`, línea 217).
  - `src/lib/anilist.ts`: popularidad mínima de 25.000 (línea 62).
  - La sincronización corre sólo con el botón: `src/app/api/tendencias/sync/route.ts`.
- **Modelos para imprimir:** `src/lib/stl-search.ts:226` (`searchSTLModels`: Printables, Thingiverse, Cults y MyMiniFactory). Se reutiliza tal cual.
- **ML:**
  - `mlFetch` (`src/lib/mercadolibre.ts:319`) con el token de la cuenta.
  - `GET /trends/MLA` y `/trends/MLA/{cat}` contestan 50 palabras. Probado el 2026-11-20 con MLA, MLA1132 y MLA1574.
- **La temática de un producto** es `Modelo.serie` (`prisma/schema.prisma:83`), texto libre. Las ventas de 30 días contra los 30 anteriores, por serie, el 2026-11-20:

| Serie (tal como está) | Productos | Últimos 30 d | 30 d anteriores |
|---|---|---|---|
| JOJO | 1 | 113 | 137 |
| Obssesion | 1 | 33 | 22 |
| K4os | 3 | 28 | 30 |
| Kpop K4os | 1 | 27 | 21 |
| Demon Slayer | 31 | 18 | 5 |
| Herramientas | 4 | 16 | 13 |
| Devil may cry / Devil May Cry | 1 + 1 | 3 + 2 | 1 + 2 |
| AC/DC | 1 | 3 | 2 |
| BTS | 3 | 1 | 3 |
| Jojos | 1 | 1 | 3 |
| One Piece / One piece | 8 + 2 | 0 | 1 |
| Mundial fifa 2026 | 4 | 0 | 0 |
| Kpop Huntrix | 3 | 0 | 0 |
| (sin serie) | 18 | 47 | 16 |

  La misma temática aparece escrita de varias formas: "JOJO" y "Jojos", "K4os" y "Kpop K4os",
  "Devil may cry" y "Devil May Cry", "One Piece" y "One piece". Las ve igual el normalizado
  (mayúsculas y tildes) o un alias.
- **Categorías de ML de los productos activos:** 76 sin `categoriaMl` y 18 categorías hoja distintas (la más usada, MLA352391, en 11).
- **Cron:** `/api/cron/ml` corre diario a las 9 UTC (`vercel.json`), protegido con `CRON_SECRET` (`src/app/api/cron/ml/route.ts:17-22`).

## 2. Modelo de datos

```sql
-- prisma/sql/tendencias-por-tema.sql — aditivo.
CREATE TABLE IF NOT EXISTS public.temas (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  nombre      text NOT NULL,
  tipo        text NOT NULL DEFAULT 'otro',     -- anime, pelicula, serie, kpop, musica, juego, personaje, deporte, otro
  alias       text[] NOT NULL DEFAULT '{}',     -- normalizados: sin mayúsculas ni tildes
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS temas_tenant_nombre ON public.temas (tenant_id, lower(nombre));

-- La foto diaria de /trends: una fila por categoría, palabra y día.
CREATE TABLE IF NOT EXISTS public.busquedas_ml (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id    text NOT NULL DEFAULT 'sendero3d',
  categoria_id text NOT NULL,                   -- 'MLA' = todo el sitio
  palabra      text NOT NULL,
  normalizada  text NOT NULL,
  posicion     int  NOT NULL,                   -- 1 a 50
  url          text,
  dia          date NOT NULL,
  UNIQUE (tenant_id, categoria_id, normalizada, dia)
);
CREATE INDEX IF NOT EXISTS busquedas_ml_dia ON public.busquedas_ml (tenant_id, dia DESC);

CREATE TABLE IF NOT EXISTS public.busquedas_descartadas (
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  normalizada text NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, normalizada)
);

ALTER TABLE public.eventos_tendencia
  ADD COLUMN IF NOT EXISTS tema_id    text REFERENCES public.temas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_ar   timestamptz,          -- estreno en Argentina (TMDB release_dates, tipos 2 y 3)
  ADD COLUMN IF NOT EXISTS anual      boolean NOT NULL DEFAULT false,  -- fechas comerciales: se repiten
  ADD COLUMN IF NOT EXISTS archivado  boolean NOT NULL DEFAULT false;

ALTER TABLE public.temas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busquedas_ml ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.busquedas_descartadas ENABLE ROW LEVEL SECURITY;
```

- **RLS:** prendido y sin políticas; sólo el servidor (Prisma) lee y escribe, como `ajustes_precio`.
- **Prisma:** se agregan los modelos `Tema`, `BusquedaMl` y `BusquedaDescartada`, y se suman las columnas nuevas a `EventoTendencia`.
- **No se borra nada.** `sugerencias_producto` queda sin uso, y se borra en otra PR después de unos días.

## 3. Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/tendencias/temas` | Lista de temas con señales, búsquedas nuevas y próximos eventos |
| POST | `/api/tendencias/temas` | Crea un tema, a mano o desde una búsqueda nueva |
| GET | `/api/tendencias/temas/[id]` | La ficha: búsquedas, eventos, productos y sus ventas |
| PATCH | `/api/tendencias/temas/[id]` | Nombre, tipo, alias; `{ unirCon }` mueve los alias y eventos de otro tema a este |
| POST | `/api/tendencias/busquedas` | `{ palabra, accion: "descartar" }` |
| POST | `/api/tendencias/sync` | Ya existe; pasa a correr ML y calendario (`lib/tendencias-sync.ts`) |
| GET | `/api/cron/tendencias` | Lo mismo, diario, con `CRON_SECRET` |
| GET | `/api/tendencias/stl-search` | Sin cambios |
| GET, PUT, DELETE | `/api/tendencias/[id]` | Eventos: se suma `temaId` |

`/api/tendencias/seed` y `/api/tendencias/sugerencias/[id]` dejan de usarse. Se borran en la
última tarea, cuando la pantalla nueva no los llama.

## 4. Lógica

### `lib/temas.ts` (pura, sin base)

- `normalizar(s)`: minúsculas, sin tildes (NFD), sin signos, con los espacios colapsados.
- `coincide(palabra, alias)`: el alias aparece como palabra entera o palabras seguidas dentro de la búsqueda.
  - Ejemplo: "muneco mini labubu the" ↔ "labubu" coincide; "bts" no coincide dentro de "botas".
  - Mínimo 3 letras por alias.
- `señales(tema, datos)`: devuelve las señales con su peso y su texto.

| Señal | Peso | Texto |
|---|---|---|
| Búsqueda de ML en el top 10 / 25 / 50 de una categoría | 3 / 2 / 1 | "#4 en Juguetes" |
| Búsqueda que no estaba hace 7 días | +1 | "nueva esta semana" |
| Evento a ≤ 21 / ≤ 45 / ≤ 90 días (estreno en Argentina si hay) | 3 / 2 / 1 | "estreno en 12 días" |
| Ventas: 30 d ≥ 1,5 × los 30 anteriores y ≥ 5 unidades | 2 | "vendiste 18, antes 5" |
| Ventas: 30 d ≥ 10 | 1 | "vende 113 por mes" |
| Con señal de ML o de evento y sin productos | marca | "no tenés producto" |

  El orden es por suma de pesos, y la fila muestra las señales (RN-1).

### `lib/tendencias-ml.ts`

1. Categorías a leer:
   - `MLA` (todo el sitio);
   - las `categoriaMl` de los productos activos;
   - la raíz de cada una (`GET /categories/{id}` → `path_from_root[0]`), cacheada en la tabla `config_tenant`.
2. Por cada categoría, `GET /trends/MLA/{cat}`. Si contesta 404 o vacío, se saltea y se anota.
3. Upsert en `busquedas_ml` con el día de hoy.
4. Lista de palabras genéricas que no son tema: ofertas, navidad, buscar, notebook…, en `lib/temas.ts`.

### `lib/tendencias-calendario.ts`

- **TMDB:** lo de hoy, más `GET /movie/{id}/release_dates` para los estrenos de los próximos 90 días que no tienen `fecha_ar` o la tienen de hace más de 7 días.
  - Se toma la fecha de `AR`, tipos 2 y 3.
  - Fuera la lista de franquicias, la "viralidad" y las sugerencias.
- **AniList:** sin cambios en la consulta.
- **Archivo:** `archivado = true` a los 7 días de `fecha_fin ?? fecha`.
- **Fechas comerciales:**
  - Las 14 de hoy pasan a `anual = true`.
  - La vista calcula la próxima ocurrencia.
  - Las móviles (Día del Padre, de la Madre, del Niño) llevan su regla en `lib/fechas-comerciales.ts`, por ejemplo "tercer domingo de junio".
- **Vincular a un tema:** cada evento nuevo se vincula solo si su título coincide con un alias. Si no, queda suelto y se puede vincular a mano desde la ficha.

### `lib/tendencias-vista.ts`

Arma la respuesta de `GET /api/tendencias/temas` en tres consultas:
- los temas con sus alias;
- las búsquedas de los últimos 8 días;
- los eventos no archivados de los próximos 120 días.

A eso le suman las ventas por serie normalizada (30 d y 30 d anteriores, `items_pedido` + `pedidos.fecha_pedido`, sin cancelados).

### Siembra de temas

`scripts/sdd-016-sembrar-temas.ts`:
- crea un tema por serie normalizada de los productos activos;
- aplica las uniones que valide Agustín (sección 10 del funcional);
- se puede correr de nuevo sin duplicar nada.

## 5. Páginas y componentes

| Ruta / componente | Notas |
|---|---|
| `src/app/(app)/tendencias/page.tsx` | Rehecha, corta: arma la lista y abre la ficha |
| `components/tendencias/fila-tema.tsx` | Foto del producto más vendido (o inicial), nombre, señales, barra de puntaje |
| `components/tendencias/ficha-tema.tsx` | Sheet derecho, como `components/precios/ficha-precio.tsx` |
| `components/tendencias/busquedas-nuevas.tsx` | Chips de palabras con "Crear tema" y "Descartar" |
| `components/tendencias/calendario.tsx` | Próximos 120 días por semana; reemplaza `CalendarioAnual` |
| `components/tendencias/buscar-modelos.tsx` | Lo de `STLSearchPanel` (línea 285), movido |

"Crear producto" navega a `/modelos/nuevo?nombre=…&serie=…`. Hay que ver si el alta nueva lee
`serie` de la URL; si no, se suma (TASK-006).

## 6. Integraciones externas

| Fuente | Límite | Si falla |
|---|---|---|
| ML `/trends` | Con el token de la cuenta. Unas 20 llamadas por día | Queda la última foto, con su fecha (RN-2) |
| ML `/categories/{id}` | Una vez por categoría, cacheada | Se usa sólo la hoja |
| TMDB | Lo de hoy, más unas 60 `release_dates` por día como mucho | Fecha mundial, marcada |
| AniList | Sin cambios | Sin cambios |
| Fase 2: YouTube Data API | `videos.list chart=mostPopular regionCode=AR videoCategoryId=10` = 1 unidad; 10.000 por día | Se saltea |
| Fase 2: Last.fm | `geo.getTopArtists country=Argentina` y `tag.getTopArtists tag=k-pop`, cruzados acá | Se saltea |
| Fase 2: Bandsintown | Por artista, con app id aprobado | Carga a mano |

Cada fuente corre en su `try`: una caída no frena a las otras. El resultado del cron queda en
`config_tenant.data.tendencias_sync`, con cada fuente, cuántas filas trajo, el error y la hora. La
pantalla lo muestra en el pie.

## 7. Seguridad

- Todo con `getAuthenticatedTenant`; las escrituras con `getAuthenticatedTenantNonDemo`.
- El cron, con `CRON_SECRET`, igual que `/api/cron/ml`.
- Las claves de la fase 2 van como variables de entorno en Vercel (`YOUTUBE_API_KEY`, `LASTFM_API_KEY`, `BANDSINTOWN_APP_ID`). Se nombran, nunca se escriben en el vault.
- Las palabras de ML se muestran como texto, sin HTML.

## 8. Pruebas

| Script | Qué prueba |
|---|---|
| `scripts/sdd-016-probar-temas.ts` | `normalizar` y `coincide` con palabras reales de ML ("muneco mini labubu the", "kpop", "botas") y las series de hoy; `señales` con datos fijos |
| `scripts/sdd-016-probar-busquedas.ts` | Lee `/trends` de verdad, sin guardar: cuántas categorías contestan y qué coincide con qué tema |
| `scripts/sdd-016-probar-calendario.ts` | `release_dates` de 3 películas conocidas, y la próxima ocurrencia de las fechas móviles de 2027 |

Producción: la siembra de temas se corre una vez y se revisa con Agustín. No hay datos de prueba que borrar.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| ML cierra `/trends` o le pide otro permiso | Queda la última foto con su fecha; las otras señales siguen |
| Alias cortos que coinciden de más ("one") | Palabra entera y mínimo 3 letras; la ficha muestra qué búsqueda sumó |
| Palabras genéricas que tapan todo ("ofertas") | Lista de genéricas, y la categoría `MLA` general pesa la mitad |
| El cron tarda | Las llamadas son pocas; `maxDuration = 120` y cada fuente con su timeout |
| Unir temas mal | `unirCon` se puede deshacer separando alias; no toca productos (RN-3) |

## 10. Documentación a actualizar

- [ ] `01 - Inventario/INV - Flujos.md`: navegación (ficha del tema), endpoints nuevos y viejos, cron nuevo, sección de Tendencias con mermaid.
- [ ] `01 - Inventario/INV - Radar de Tendencias.md`: la nota del módulo, reescrita.
- [ ] `Flujos del ecosistema.md`: ML `/trends` como contrato nuevo con ML (sólo lectura).
- [ ] `docs/sdd/README.md`: fila 016.
