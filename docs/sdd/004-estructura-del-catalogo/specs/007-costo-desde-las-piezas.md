---
id: 007-costo-desde-las-piezas
feature: 004-estructura-del-catalogo
titulo: El costo de un producto sale solo de sus piezas de Bodega; no se carga a mano ni se aprueba
estado: validated
actualizado: 2026-10-24
---

# Costo desde las piezas

## Contexto
El costo hoy se escribe dos veces: en la calculadora de Bodega y en el ERP (costo base del modelo
más un adicional por variante). Para que coincidan hay que ir a Integraciones › Costos y aplicar
un plan a mano (`sincronizar-costos.ts`). Desde la 2.34 cada pieza tiene además su material, y el
ERP todavía costea todo con el precio del material por defecto (SDD 003, TASK-006).

## Requisitos
- **REQ-1** — El costo de cada fila de stock con pieza de Bodega debe calcularse con la receta de
  esa pieza y el precio de **su** material.
- **REQ-2** — El ERP debe actualizar solo los costos del producto (base y adicionales) cuando
  cambia la receta o el material de una pieza, sin plan ni aprobación.
- **REQ-3** — Un producto cuyo costo no se puede explicar desde sus piezas (le falta la receta a
  una, o tiene un adicional que no sale de ninguna) no debe cambiar, y su página debe decir por qué.
- **REQ-4** — En la página, el costo de un producto con alguna pieza costeada en Bodega debe verse
  como "de Bodega", sin campo editable. Mientras ninguna de sus piezas tenga receta (al
  2026-10-24, 83 de 125 filas), o si no se imprime, el costo sigue editable a mano.
- **REQ-5** — La pestaña Integraciones › Costos debe desaparecer.

## Reglas de negocio
- **RN-1** — Costo de una pieza = fabricación (gramos × precio por kilo de su material + horas de
  máquina, la misma fórmula que la calculadora) + insumos declarados en Bodega.
- **RN-2** — Costo de una combinación = la pieza que es (la del producto o la de su opción "otra
  pieza") + el insumo de su grupo "insumo", si lo tiene.
- **RN-3** — Lo que ya se vendió no cambia: el costo queda guardado en cada línea de pedido al
  venderse, como hoy.
- **RN-4** — Se recalcula en los mismos momentos que el alta automática (`/api/cambios`, `GET
  /api/stock`, el cron diario), y sólo si alguna pieza cambió desde la última vez.

## Criterios de aceptación
- [ ] **CA-1** — Dada una pieza en PETG Lite ($15.000/kg) de 100 g, entonces su fabricación usa
  $15.000/kg, no los $18.000 del material por defecto.
- [ ] **CA-2** — Dado un cambio de gramos de "Tanjiro Katana nueva 95cm" en Bodega, cuando Bodega
  sincroniza, entonces el costo del producto en el ERP cambia sin que nadie apruebe nada.
- [ ] **CA-3** — Dado un producto con una pieza sin receta, entonces su costo no cambia y la página
  dice "falta costear: <pieza>".

## Casos borde
- Una pieza recién creada sin archivo (gramos y horas vacíos): falta costear, no cero.
- Bodega todavía no subió los gastos de venta o los materiales: se usa lo de antes y se avisa.

## Fuera de alcance
- Precios: SDD 003.
- Recalcular el costo de pedidos ya cargados.

## Preguntas abiertas
Ninguna.

## Referencias
- `src/lib/costos-bodega.ts:136` (`costosPorFilaDeStock`), `src/lib/sincronizar-costos.ts:242`
  (`aplicarPlanDeCostos`).
- SDD 003, spec 001 (catálogo de materiales) y TASK-006, que esta spec absorbe.
- SDD 001, fase 4 de `Mapeo de productos` ("costo por combinación desde las piezas de Bodega").
