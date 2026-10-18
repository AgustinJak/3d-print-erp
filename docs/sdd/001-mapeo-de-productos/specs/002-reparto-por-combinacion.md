---
id: 002-reparto-por-combinacion
feature: 001-mapeo-de-productos
titulo: El reparto de stock sale de la combinación, verificado antes en sombra
estado: validated
actualizado: 2026-10-18
---

# Reparto de stock por combinación

## Contexto
`componentesDeItem` decide qué filas de stock reserva una línea (la pieza más los insumos de su
receta) leyendo del JSON `variantesInfo` sólo las entradas con `matched` + `varianteId`
(`src/lib/reservas.ts:199`). Es el único consumidor que de verdad depende de ese JSON, y es el
que se rompe cuando el JSON viene con otra forma. Esta spec lo cambia para que lea las
variantes de la combinación, **sin cambiar el resultado**.

## Requisitos
- **REQ-1** — Una línea con combinación debe resolver sus componentes con el modelo y las
  variantes de esa combinación.
- **REQ-2** — Una línea sin combinación (histórica, a medida o sin mapear) debe seguir
  resolviéndose como hoy.
- **REQ-3** — Antes del cambio, el inventario debe poder comparar las dos formas en todos los
  pedidos abiertos y listar cada línea donde difieran (modo sombra).
- **REQ-4** — El cambio se activa recién con la comparación en cero.

## Reglas de negocio
- **RN-1** — Los componentes no cambian de forma: pieza principal por `stock.clave` (modelo +
  variantes que `afectaStock`) e insumos por `reglas_insumo`. Sólo cambia **de dónde salen** las
  variantes.
- **RN-2** — Si la línea tiene combinación **y** JSON, manda la combinación. El JSON queda como
  registro de lo que mandó el canal.
- **RN-3** — La comparación cuenta como diferencia cualquier componente distinto (fila de stock,
  cantidad o motivo de "a pedido") entre las dos formas.

## Criterios de aceptación
- [ ] **CA-1** — Dado un pedido abierto con una katana "Con Funda" mapeada por id, cuando se
  compara, entonces las dos formas dan la hoja y la funda de su receta.
- [ ] **CA-2** — Dada la comparación sobre todos los pedidos abiertos del 2026-10-18, entonces
  devuelve cero diferencias, o una lista con cada línea, la forma vieja y la nueva.
- [ ] **CA-3** — Con el cambio activo, el resultado de `reasignarReservas` sobre los pedidos
  abiertos es idéntico al de antes del cambio (mismas reservas, mismos faltantes).
- [ ] **CA-4** — Una línea a medida (sin modelo) sigue siendo un componente "a pedido" con su
  descripción.

## Casos borde
- Línea con combinación desactivada: se resuelve igual (la combinación existió cuando se vendió).
- Línea vieja editada a mano sin `varianteId` (había 50 al 2026-10-18, todas cerradas): el
  backfill de la spec 003 la resuelve por nombre; si no puede, queda sin combinación y sigue por
  el JSON.

## Fuera de alcance
- Una tabla de componentes por combinación (receta explícita con cuál "limita"): hoy
  `stock.clave` + `reglas_insumo` alcanzan y no hay que cargar nada nuevo.

## Preguntas abiertas
Ninguna.

## Referencias
- `src/lib/reservas.ts:171` (`ItemResoluble`), `:199` (`componentesDeItem`), `:294`
  (`reasignarReservas`), `:606` (`coberturaDePedidos`)
