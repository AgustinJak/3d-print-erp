---
id: 004-mapeo-por-canal
feature: 001-mapeo-de-productos
titulo: Cada publicación de un canal apunta a una combinación, y lo que no está mapeado espera en una cola
estado: validated
actualizado: 2026-10-18
---

# Mapeo por canal

## Contexto
Cada canal resuelve hoy "qué se vendió" con su propia lógica de texto:

- **Mercado Libre:** la publicación (MLA) se mapea a mano a un modelo
  (`publicaciones_ml`); los atributos de la variación se buscan por nombre entre las variantes;
  y las variantes que la publicación lleva siempre se configuran aparte
  (`src/lib/mercadolibre-sync.ts:405-480`).
- **Shop:** SKU del modelo y, si no, nombre exacto; las opciones, por nombre normalizado; las
  katanas partidas, con un parche que busca el modelo del tamaño
  (`src/app/api/webhook/shop/pedido/route.ts:29`, `:491-600`).

Al 2026-10-18: 21 de los 50 SKUs del Shop no existen en el ERP, la funda tiene tres nombres de
grupo en el Shop, "Pack" (cantidad) se trata como una variante, y ML manda atributos de color
que el modelo no tiene en 240 líneas de los últimos 180 días. Esta spec reemplaza todo eso por
una sola tabla en el ERP.

## Requisitos
- **REQ-1** — El inventario debe guardar, por canal, a qué combinación corresponde cada clave
  externa, y por cuántas unidades.
- **REQ-2** — Al entrar una venta, la línea debe resolverse por esa tabla antes que por cualquier
  otra lógica.
- **REQ-3** — Una clave que no está en la tabla debe intentar resolverse con la lógica de hoy; si
  resuelve sin dudas, se guarda el mapeo como automático y se usa; si no, la clave queda en una
  cola para mapear a mano.
- **REQ-4** — En Integraciones debe haber una pantalla con la cola y con todos los mapeos, para
  elegir o crear la combinación, cambiar las unidades o marcar "otro negocio".
- **REQ-5** — Al mapear una clave de la cola, las líneas de pedidos abiertos que entraron con esa
  clave sin combinación deben completarse.
- **REQ-6** — Los mapeos de ML deben sembrarse desde `publicaciones_ml` y las variaciones de cada
  publicación, sin tocar la publicación.
- **REQ-7** — Los mapeos del Shop deben sembrarse una vez desde su catálogo: cada producto activo
  por cada combinación de sus opciones, con la clave por ids. Al 2026-10-18, los 48 pedidos del
  Shop con opciones guardan `opcion_id` en todas, así que la clave por ids sirve también para el
  historial.

## Reglas de negocio
- **RN-1** — Claves externas:

  | Canal | Clave | Ejemplo |
  |---|---|---|
  | Mercado Libre | `<MLA>\|<variation_id>`; vacío si la publicación no tiene variaciones | `MLA2810531220\|` |
  | Shop (con ids, spec 005) | `<producto_id>\|<opcion_ids ordenados, separados por coma>` | `3f2a…\|9c1d…,a07e…` |
  | Shop (mientras no mande ids) | `sku:<SKU>\|<valores de las opciones normalizados y ordenados>` | `sku:SS-DEM-KAT-006\|95cm,con funda` |

- **RN-2** — **Unidades:** la línea guarda `cantidad × unidades` y `precio_unitario ÷ unidades`.
  "Pack · 10 unidades ($2250u)" de 1 → 10 unidades a $2.250. Por defecto 1.
- **RN-3** — **Otro negocio:** una clave marcada así se descarta de la venta, como hoy
  `publicaciones_ml.ignorar` (las de Shay).
- **RN-4** — Resolución automática sin dudas = encuentra el modelo **y** todas las opciones o
  atributos del canal son variantes del modelo o están en una lista de atributos que no definen
  qué se vende (por ejemplo, un color en una publicación de un solo color). Cualquier otra cosa va
  a la cola.
- **RN-5** — Una venta con una clave en la cola entra igual (como hoy): con el mejor modelo que se
  pudo deducir, o sin modelo, y el pedido con `revision_manual`. Nunca se pierde una línea.
- **RN-6** — Un mapeo automático se puede corregir a mano; desde ese momento queda manual y la
  resolución automática no lo pisa.
- **RN-7** — El tamaño de una katana es una opción del Shop y una combinación del modelo de ese
  tamaño en el ERP: el mapeo lo resuelve y el parche `resolverModeloPorTamano` deja de hacer
  falta cuando las claves del Shop estén mapeadas.
- **RN-8** — Cómo se mapean los grupos especiales del Shop (respuesta de Agustín, 2026-10-18):

  | Producto | Grupo | Qué es | Cómo se mapea |
  |---|---|---|---|
  | Vaso BTS MilkShake | Firma (7 integrantes) | El mismo vaso | 7 combinaciones que consumen **la misma** fila de stock |
  | Llavero BTS BT21 | Modelo (8 personajes) | La misma base | Igual que el vaso: una fila de stock compartida |
  | Jabonera minimalista | Modelo (15 diseños) | **Cada diseño es otra pieza** | Una variante que afecta stock por diseño: 15 combinaciones, 15 filas, una pieza de Bodega cada una |
  | Katana Kitetsu | Exhibidor | Un insumo, como la funda | "Con Exhibidor" lleva el exhibidor en su receta (spec 006) |
  | Llavero Ballena 52 Hz | Pack | Una cantidad | Unidades 1, 10 o 20 (RN-2) |

## Criterios de aceptación
- [ ] **CA-1** — Dada la siembra de ML y la del Shop, entonces cada variación de cada publicación mapeada, y
  cada combinación de opciones de cada producto activo del Shop, tiene su clave; las que se resolvieron solas apuntan a su combinación y las demás están en la cola.
- [ ] **CA-2** — Dada una venta de ML de una clave mapeada, entonces la línea toma esa
  combinación sin mirar los nombres de los atributos.
- [ ] **CA-3** — Dada una venta del Shop de una katana de 95 cm "Con Funda", entonces la línea
  queda con la combinación "… 95cm · Con Funda" del modelo de 95 cm.
- [ ] **CA-4** — Dada una venta del Shop de "Pack · 10 unidades" de 1 a $22.500, entonces la línea
  queda con 10 unidades a $2.250.
- [ ] **CA-5** — Dada una clave nueva que no resuelve sola, entonces aparece en la cola con el
  título, las opciones y la última venta, y el pedido entra con `revision_manual`.
- [ ] **CA-6** — Cuando se mapea esa clave, entonces la línea del pedido abierto queda con la
  combinación, su costo se recalcula y se reparte el stock.

## Casos borde
- Publicación de ML que cambia de variaciones: la clave nueva cae en la cola; la vieja queda.
- Producto del Shop que cambia de opciones: igual.
- Dos claves a la misma combinación: válido (dos publicaciones de lo mismo, como Yamato con y
  sin funda de un mismo MLA).
- Una línea del Shop `personalizado: true` no se mapea: entra sin modelo, como desde el
  2026-10-18.

## Fuera de alcance
- Escribir el SKU en las publicaciones de ML o en los productos del Shop.
- Borrar `publicaciones_ml` (queda hasta que nada la lea).
- Sincronizar stock hacia los canales (ver `Stock unificado`: no se hace).

## Preguntas abiertas
Ninguna. La de los diseños se respondió el 2026-10-18 (ver RN-8).

## Referencias
- `src/lib/mercadolibre-sync.ts:405` (mapeo por MLA), `:462` (atributos), `:473` (implícitas)
- `src/lib/mercadolibre.ts:256` (`variation_id` en la orden)
- `src/app/api/webhook/shop/pedido/route.ts:29` (`resolverModeloPorTamano`), `:491` (líneas)
- `prisma/schema.prisma` (`PublicacionMl`)
