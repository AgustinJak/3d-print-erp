---
feature: 016-tendencias-por-tema
---

# Bitácora · Tendencias por tema

Diario de sesiones. **Solo se agrega al final, nunca se reescribe.**

---

## 2026-11-20 · Claude (el SDD)

**Pedido de Agustín:** mejorar Tendencias con la interfaz nueva, y buscar mejores fuentes para
recitales en Argentina, animes, películas, k-pop y canciones de k-pop. Después: "dale, armá el SDD 016".

**Qué se hizo**
- Se relevó lo que hay:
  - 239 eventos, todos activos, de los que 18 son futuros.
  - 262 sugerencias con 25 nombres distintos y ninguna vinculada.
  - 1 recital a mano, ya pasado.
  - Nada de música.
- Se probó `GET /trends/MLA`, `/trends/MLA/MLA1132` y `/trends/MLA/MLA1574` con el token de la cuenta: 50 palabras cada una. En Juguetes aparecían kpop, bluey, labubu, pusheen y skibidi toilet.
- Se midieron las ventas por `serie` (30 d contra los 30 anteriores): la temática está escrita de varias formas (JOJO y Jojos, K4os y Kpop K4os).
- Se descartaron:
  - Spotify: sin listas oficiales para apps nuevas desde 2024.
  - Google Trends: alfa, sólo por solicitud.
  - Ticketmaster: no cubre Argentina.
  - Las agendas de comebacks: armadas a mano, sin API.

**Para el que sigue**
- Esperar la validación de Agustín (sección 10 del funcional) antes de tocar la base.
- El script de prueba de `/trends` se borró. Para repetirlo: `mlFetch("sendero3d", "/trends/MLA/MLA1132")`.

## 2026-11-20 · Claude (validación)

Agustín validó:
- temas con alias, sin tocar los productos (uniones iniciales en la sección 9 del funcional);
- Huntrix, K4os y BTS como tres temas;
- las categorías de ML de los productos, su raíz y la del sitio;
- la fase 1 primero.

## 2026-11-20 · Claude (fase 1)

**Tareas:** TASK-001 a TASK-007 completas. TASK-008 (probar y publicar) pendiente.

**Qué se hizo**
- Base: `temas`, `busquedas_ml`, `busquedas_descartadas` y 4 columnas en `eventos_tendencia`.
- Lógica pura en `lib/temas.ts` (normalizar, coincidir, señales); siembra de 37 temas.
- ML `/trends` por categoría (`lib/tendencias-ml.ts`), calendario con estreno AR y fechas que se calculan (`lib/tendencias-calendario.ts`, `lib/fechas-comerciales.ts`), vista (`lib/tendencias-vista.ts`), sync y cron.
- Pantalla nueva con las tarjetas, la lista por tema, las búsquedas nuevas, las próximas fechas y la ficha lateral. "Crear producto" lleva al alta con `?nombre=&serie=`: el alta ahora lee `serie` de la URL.
- Primera vuelta real: arriba quedan Demon Slayer (#3 en Espadas y 18 ventas contra 5), One Piece, K4os y Mundial.

**Problemas y cómo se resolvieron**
- **Fechas corridas un día.** Las fechas se guardan a la medianoche UTC, así que leídas en hora argentina daban un día menos → `diasHasta` toma la fecha UTC del evento y "hoy" de Buenos Aires. Hay prueba de las 23:30.
- **Búsquedas nuevas con 902 palabras.** Las raíces traen Bebés, Mascotas y otras → se agrupan por ámbito, se muestran las primeras 15 por categoría y se sacan las que son sólo números.
- **Búsquedas de personajes sin tema** (tanjiro, rengoku, zoro) → alias de personajes. Se sacaron "mira" y "ace" porque coinciden de más.
- **`prisma generate` falló con EPERM.** El MCP de publicidad tiene tomado el motor; el cliente igual se generó.

**Para el que sigue**
- Revisar con Agustín los temas: las uniones Mundial y Gravity Falls, los temas que son tipo de producto (Herramientas, Exhibidor…) y Repuesto desactivado.
- Después de publicar: borrar `/api/tendencias` (GET/POST), `[id]`, `seed` y `sugerencias/[id]` (TASK-008).

## 2026-11-20 · Claude (pestaña Calendario)

Agustín preguntó dónde quedaron las fechas y lo que mostraba la pantalla vieja. Se sumó la pestaña
Calendario (`components/tendencias/calendario.tsx`):
- los próximos 6 meses por mes, con póster y descripción;
- un filtro por tipo;
- "Sumar a un tema…" para los estrenos sueltos.

La vista pasó de 120 a 183 días. Con los datos del 2026-11-20 hay 27 fechas, 19 sin tema y 20 con póster.

## 2026-11-20 · Claude (Descubrir)

**Pedido de Agustín:** "mi gracia era con esa sección encontrar tendencias que vienen y que están
para sacar nuevos productos, no mejorar o ver en qué tendencias están mis productos actuales".

**Qué se hizo**
- Se probó agrupar las búsquedas por palabra y no sirve: salen inflables, sillas, cartas. Los
  nombres de franquicias no se detectan contando palabras.
- Lo que sí funciona es mirar las categorías correctas: las subcategorías de Juguetes y Cotillón,
  más Espadas y Llaveros. Ahí aparecen toy story, jujutsu kaisen, illit, stitch, minecraft, kuromi
  y el grinch.
- La pestaña principal pasó a ser **Descubrir** (`lib/tendencias-descubrir.ts`,
  `components/tendencias/descubrir.tsx`), con "Lo que más suena", una tarjeta por categoría y
  las acciones Buscar modelos, Crear producto, Seguir y Descartar.
- Las categorías se eligen en pantalla (`/api/tendencias/vidrieras`) y el cron las lee.
- Las pestañas quedaron Descubrir, Calendario y Mis temas. El panel "Búsquedas nuevas" se sacó
  (`busquedas-nuevas.tsx` borrado).
- Se guardó la foto del 2026-11-20 de las 10 categorías. "Nueva" y "subió" aparecen desde el 2026-11-27.
