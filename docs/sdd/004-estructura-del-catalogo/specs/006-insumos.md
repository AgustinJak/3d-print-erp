---
id: 006-insumos
feature: 004-estructura-del-catalogo
titulo: Las fundas y demás insumos son una cosa propia, y al agregar una funda se elige de una lista que dice quién más la usa
estado: validated
actualizado: 2026-10-24
---

# Insumos

## Contexto
Las 10 fundas son productos desactivados de la categoría Fundas, con su fila de stock y su pieza
de Bodega. Las recetas las usan bien (la Funda 65cm Demon Slayer la consumen 16 katanas, la
Funda 95cm 8, la blanca 2 y otras 7 son propias), pero en pantalla no aparecen como lo que son: no
hay una lista de insumos, y un producto desactivado se confunde con uno que dejó de venderse.

## Requisitos
- **REQ-1** — Un producto debe poder marcarse como **insumo**: no se vende solo, no aparece en la
  lista de productos ni en los selectores de pedido, y sí en la de insumos.
- **REQ-2** — La lista de productos debe tener un filtro **Insumos**, con el stock de cada uno y
  cuántos productos lo usan.
- **REQ-3** — Al agregar un grupo "insumo" (spec 003) se debe elegir el insumo de esa lista,
  viendo "usada por N productos".
- **REQ-4** — Desde la misma lista se debe poder crear un insumo nuevo eligiendo su pieza de Bodega.
- **REQ-5** — La página de un insumo debe mostrar qué productos lo usan.

## Reglas de negocio
- **RN-1** — Un insumo tiene una sola fila de stock, enganchada a su pieza de Bodega.
- **RN-2** — Un insumo usado por alguna receta no se puede borrar; se puede reemplazar en bloque
  (todas las recetas que lo usan pasan a otro).
- **RN-3** — Los 10 productos de la categoría Fundas y los que ya son insumo de alguna receta pasan
  a ser insumos al aplicar la feature.

## Criterios de aceptación
- [ ] **CA-1** — Dada la lista de productos, entonces no aparecen las fundas; con el filtro
  Insumos, aparecen las 10 con "usada por 16", "usada por 8"…
- [ ] **CA-2** — Dado el grupo Funda de una katana nueva, cuando se elige la Funda 65cm Demon
  Slayer, entonces "Con Funda" la descuenta y la funda pasa a "usada por 17".
- [ ] **CA-3** — Dada la Funda blanca 95cm, cuando se la reemplaza en bloque por otra, entonces las
  recetas de Rengoku 95 y Zenitsu 95 apuntan a la nueva.

## Casos borde
- Un insumo que también se vende suelto (una funda sola): sigue siendo producto, no insumo, y
  puede usarse en recetas igual. Hoy no hay ninguno.

## Fuera de alcance
- Insumos que no se imprimen (cadenas, imanes): siguen siendo el costo de insumos de la pieza en
  Bodega.

## Preguntas abiertas
Ninguna.

## Referencias
- `GET /api/insumos` (`src/app/api/insumos/route.ts`).
- `reglas_insumo` (`modelo_id`, `requiere`, `stock_id`, `cantidad`).
