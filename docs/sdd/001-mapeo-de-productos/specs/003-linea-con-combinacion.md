---
id: 003-linea-con-combinacion
feature: 001-mapeo-de-productos
titulo: Cada línea de pedido guarda qué combinación se vendió
estado: validated
actualizado: 2026-10-18
---

# La línea del pedido guarda la combinación

## Contexto
Hoy la línea guarda `modeloId` + `variantesInfo`, un JSON con al menos seis formas distintas
según quién lo escribió (webhook de ML con y sin `origen`, webhook del Shop con `shopGrupo`, el
diálogo de edición). Esta spec hace que la línea apunte a la combinación vendible, y que el JSON
pase a ser un registro de lo que mandó el canal.

## Requisitos
- **REQ-1** — `items_pedido` debe tener la combinación de la línea (opcional).
- **REQ-2** — Las líneas que entran por el webhook de ML y por el del Shop deben guardar la
  combinación que resuelve el mapeo del canal (spec 004).
- **REQ-3** — La carga y la edición manual deben elegir una combinación, no un modelo más
  casillas de variantes.
- **REQ-4** — Las líneas existentes deben recibir su combinación cuando se la pueda deducir con
  certeza (backfill).
- **REQ-5** — `modeloId` se sigue guardando, igual al modelo de la combinación, para no tocar las
  consultas que lo leen (panel, `/stock`, finanzas, historial).

## Reglas de negocio
- **RN-1** — Backfill: la combinación de una línea vieja es `(modeloId, variantes con matched +
  varianteId)`. Las líneas viejas del diálogo sin id se resuelven por nombre exacto contra las
  variantes del modelo (la misma regla de `variantesElegidas`, `src/lib/variantes-item.ts`). Si
  no se puede, la línea queda sin combinación.
- **RN-2** — Una línea a medida o sin modelo no tiene combinación (sigue como desde el 2026-10-18).
- **RN-3** — El costo de la línea sigue saliendo como hoy (`costoModelo` + `costoVariante` de sus
  variantes). La combinación no cambia ningún número.
- **RN-4** — Cambiar la combinación de una línea en el diálogo recalcula precio y costo como hoy
  al cambiar de modelo o tocar una variante.

## Criterios de aceptación
- [ ] **CA-1** — Dada una venta de ML de una publicación mapeada, entonces la línea queda con la
  combinación del mapeo y su `modeloId`.
- [ ] **CA-2** — Dado el diálogo de un pedido con una katana "Con Funda", cuando se abre,
  entonces muestra esa combinación elegida; cuando se guarda sin tocar, la línea no cambia.
- [ ] **CA-3** — Cuando se carga un pedido nuevo a mano, el selector busca por nombre o SKU de la
  combinación.
- [ ] **CA-4** — Dado el backfill sobre todas las líneas del 2026-10-18, entonces informa cuántas
  quedaron con combinación, cuántas sin, y por qué.
- [ ] **CA-5** — Ningún total de finanzas ni del panel cambia por el backfill.

## Casos borde
- Línea de un modelo consolidado: el backfill la deja con la combinación del modelo viejo
  (desactivada), no la mueve al nuevo; el historial cuenta lo que se vendió entonces.
- Pedido con dos líneas de la misma combinación: quedan dos líneas, como hoy.
- Variante borrada del modelo: sin combinación, sigue por el JSON.

## Fuera de alcance
- Borrar `variantesInfo` o `modeloId`.
- Reescribir el historial de costos.

## Preguntas abiertas
Ninguna.

## Referencias
- `prisma/schema.prisma` (`ItemPedido`)
- `src/app/(app)/pedidos/pedido-dialog.tsx` (selector de modelo y casillas de variantes)
- `src/app/api/pedidos/route.ts`, `src/app/api/pedidos/[id]/route.ts` (alta y edición)
- `src/lib/variantes-item.ts` (fase 0)
