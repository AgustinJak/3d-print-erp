# Bitácora — 011: elegir la cuenta de ML en cada sección, y el rediseño

## 2026-11-13 · Claude, TASK-001 a 003 (Productos)

**El selector.** `components/cuenta-activa.tsx`: un proveedor en el layout de la app con la cuenta
elegida (`todas`, `principal`, `otra`) y los nombres de las cuentas, que salen de
`GET /api/ml/cuentas` (nuevo: sólo id y nombre, sin tokens). La elección se guarda en
`sessionStorage`: se mantiene entre secciones y al entrar de nuevo arranca en Todas, como pidió
Agustín. Con una sola cuenta conectada el selector no se dibuja y el alcance es la principal.

**La lógica, pura y probada** (`lib/productos-lista`, 12 pruebas nuevas en
`scripts/sdd-008-probar-productos.ts`, 37 en total):
- `filtrar(…, alcance)`: los filtros de ML y de entrega miran las publicaciones de la cuenta
  elegida. "Sin publicar" mirando Sendero Shop es "sin copiar".
- `diferenciasDe(variante)`: Flex, días o precio distintos entre la publicación de la principal y su
  copia (por `muestra.copiaDe`; si no se sabe, la del mismo tipo). Que falte o esté pausada no cuenta.
- `resumir(…, alcance)`: las publicaciones que toca una acción son las de la cuenta elegida, con
  cuántas de cada una (`porCuenta`). A copiar: las de la principal sin copia. A crear: las variantes
  sin publicación en la principal.
- `canalesDeModelos` suma a cada publicación el precio publicado y de cuál es copia.

**La pantalla.** La tabla pasó a filas en grilla: una columna por cuenta (las dos en Todas), cada
publicación con su estado, tipo, Flex, días y precio, y un aviso "≠" donde no coinciden. Las variantes
se abren con animación; la barra de acciones flota abajo mientras haya algo elegido y dice a cuántas
publicaciones de cada cuenta se aplica; la carga tiene la forma de la página. Animaciones con `motion`.

**Sin verificar todavía:** no se pudo ver andando porque la pantalla pide iniciar sesión. Tipos y
lint, sin errores.

**Queda:** "Igualar a Sendero 3D" (TASK-004) y las demás secciones (TASK-005 y 006).

## 2026-11-13 · Claude, TASK-005 y 006 (Precios, Promos, Pedidos, Historial, Panel)

**Precios.** Cada fila de ML dice de qué cuenta es (`FilaDeCanal.cuentaMl`, en vez de la etiqueta con
el nombre). La pestaña Mercado Libre muestra sólo la cuenta elegida; en Todas, cada fila con el punto
de su cuenta. Las confirmaciones de precio y de Flex dicen a cuántas publicaciones de cada cuenta
llegan. Pestañas y filtros con `Segmentado` (componente nuevo, la marca se desliza).

**Promos.** `campanasDeMl` lee las campañas de cada cuenta (`/seller-promotions/users/{id}` con su
token) y cada campaña sabe de cuál es; sus "adentro" y "aptas" cuentan sólo las publicaciones de esa
cuenta. El descuento propio va uno por cuenta. Leído el 2026-11-13: Sendero 3D, 12 campañas; Sendero
Shop, ninguna (y sus copias están pausadas, así que todavía no aparece en Promos).

**Pedidos e Historial.** Filtran por la cuenta: las ventas de la otra llevan su nombre como etiqueta
(docs/sdd/010); las de la web y las de a mano van con Sendero 3D. En Todas, el punto de color al lado
del cliente.

**Panel.** Rediseñado: un saludo con el estado de lo atrasado, "Hoy" (lo operativo) y el mes (la
plata), lo más vendido con barras y lo que hay que despachar. Números que cuentan al aparecer
(`NumeroAnimado`, respeta "reducir movimiento") y carga con la forma de la página.

**Sin verificar todavía:** la pantalla pide iniciar sesión. Tipos sin errores; lint sin errores nuevos
(Pedidos e Historial ya tenían avisos de `set-state-in-effect` de antes).

**Queda:** Finanzas por cuenta (con la TASK-006 de la 010) e "Igualar a Sendero 3D".
