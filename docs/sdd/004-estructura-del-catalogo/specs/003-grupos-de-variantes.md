---
id: 003-grupos-de-variantes
feature: 004-estructura-del-catalogo
titulo: Las variantes se arman en grupos (Color, Funda, Diseño) y cada grupo dice qué es
estado: validated
actualizado: 2026-10-24
---

# Grupos de variantes

## Contexto
Una variante puede ser tres cosas, y hoy nada lo dice:
- **otra pieza**: cada opción se imprime aparte y tiene su stock (los colores de la Bola de
  JOJOS, los diseños de la jabonera, los personajes del BT21);
- **un insumo**: "Con funda" descuenta la funda y "Sin funda" no (la funda puede ser compartida
  entre katanas o propia, ver spec 006);
- **solo decoración**: misma pieza para todas las opciones (las firmas del Vaso BTS).

Además, una variante no sabe a qué grupo pertenece ("Verde común" es un Color; "Con Funda", una
Funda), el lápiz crea todas como decoración (no hay forma de marcar `afectaStock`) y renombrar
una la borra y crea otra, desactivando sus combinaciones y dejando colgados sus mapeos.

## Requisitos
- **REQ-1** — Cada variante debe pertenecer a un **grupo** con nombre ("Color", "Funda",
  "Diseño", "Firma").
- **REQ-2** — Cada grupo debe tener un **tipo**: otra pieza, insumo o solo decoración.
- **REQ-3** — La sección **Variantes** de la página del producto debe mostrar los grupos con sus
  opciones.
- **REQ-4** — "Agregar grupo" debe pedir el nombre, el tipo (con un ejemplo de cada uno) y las
  opciones, una por renglón.
- **REQ-5** — En un grupo "otra pieza", cada opción debe mostrar su stock y su pieza de Bodega, y
  permitir elegirla o cambiarla.
- **REQ-6** — En un grupo "insumo", las opciones son "Con X" y "Sin X", y "Con X" debe mostrar qué
  insumo descuenta y permitir cambiarlo.
- **REQ-7** — Renombrar una opción o un grupo debe conservar sus combinaciones, sus filas de stock
  y sus mapeos.
- **REQ-8** — Agregar una opción a un grupo existente debe crear lo que haga falta (fila de stock,
  combinación).
- **REQ-9** — Borrar una opción debe pedir confirmación y decir qué se desactiva.
- **REQ-10** — Un producto sin grupos "otra pieza" debe mostrar su propia pieza de Bodega, con el
  mismo selector.
- **REQ-11** — La sección **Lo que se vende** debe listar las combinaciones con su SKU, qué
  consume cada una y si está activa.

## Reglas de negocio
- **RN-1** — Un producto tiene **a lo sumo un grupo "otra pieza"** y **a lo sumo un grupo
  "insumo"** por ahora (las katanas siguen siendo un producto por tamaño: decisión de Agustín del
  2026-10-24). Grupos de decoración, los que hagan falta.
- **RN-2** — Una opción "otra pieza" tiene `afectaStock` y una fila de stock propia; las de los
  otros tipos, no. Las dos cosas se escriben juntas y una restricción de la base impide que se
  contradigan.
- **RN-3** — Lo que se vende es una combinación con una opción de cada grupo. Combinaciones de dos
  grupos (un color + con funda) se crean cuando hacen falta, no se siembran todas.
- **RN-4** — Una pieza de Bodega se engancha a una sola fila: elegir una que ya estaba en otra
  fila la libera de esa, y la página dice cuál quedó suelta (`bodega_mapear_modelo`).
- **RN-5** — Renombrar actualiza el nombre de sus combinaciones; el SKU de la combinación no cambia.
- **RN-6** — Pasar un grupo de "otra pieza" a otro tipo: las filas de stock con stock o
  movimientos quedan (desenganchadas del producto vendible, visibles en Stock); las vacías se
  borran. Se avisa antes.
- **RN-7** — Borrar desactiva sus combinaciones y borra sus recetas (`soltarVariantesBorradas`).
  Los mapeos que apuntaban ahí vuelven a la cola en la próxima venta.

## Criterios de aceptación
- [ ] **CA-1** — Dado un producto nuevo, cuando se agrega el grupo "Diseño" de tipo otra pieza
  con "Duna" y "Brisa", entonces hay dos filas de stock y dos combinaciones.
- [ ] **CA-2** — Dado "Duna", cuando se elige su pieza de Bodega, entonces la fila queda enganchada
  y producir esa pieza en Bodega suma a esa fila.
- [ ] **CA-3** — Dado el grupo "Funda" con la Funda 95cm Demon Slayer, entonces "Con Funda" muestra
  esa funda, y cambiarla actualiza la receta.
- [ ] **CA-4** — Dada "Con Funda" mapeada desde el Shop, cuando se renombra a "Con funda negra",
  entonces la clave del Shop sigue resolviendo a la misma combinación.
- [ ] **CA-5** — Dado el Vaso BTS, entonces su grupo "Firma" es solo decoración y las 7 opciones
  comparten una fila de stock.
- [ ] **CA-6** — Dado un intento de agregar un segundo grupo "otra pieza", entonces la página no lo
  permite y explica por qué (RN-1).

## Casos borde
- Una pieza de Bodega que todavía no subió (creada sin archivo, Bodega cerrada): la fila ya
  enganchada la muestra como "pendiente de subir".
- Un nombre de opción repetido dentro del grupo: no se crea, se avisa.

## Fuera de alcance
- Un producto con tamaño y color como piezas a la vez (dos grupos "otra pieza"): no hay ninguno
  hoy; si aparece, se amplía RN-1.
- Recetas con más de un insumo por combinación: se ven como hoy ("lleva N insumos").

## Preguntas abiertas
Ninguna.

## Referencias
- `src/app/(app)/modelos/page.tsx:1164` (variantes del lápiz, sin `afectaStock`).
- `src/app/api/modelos/[id]/route.ts:59` (empareja por nombre: renombrar = borrar y crear).
- `src/components/combinaciones-modelo.tsx`, `src/lib/recetas.ts:183`.
- `src/lib/stock-filas.ts:17`, `src/lib/combinaciones.ts:359` y `:390`.
- `prisma/sql/bodega-stock.sql:101` (`bodega_mapear_modelo`).
