---
id: 003-precio-de-cada-combinacion
feature: 003-precios-desde-bodega
titulo: El ERP calcula los tres precios de cada combinación vendible con la fórmula de Bodega
estado: validated
actualizado: 2026-10-24
---

# Precio de cada combinación

## Contexto
Bodega le pone precio a una **pieza** ("Tanjiro 95"). Lo que se vende es una **combinación**
("Tanjiro 95 · Con Funda", SDD 001): la pieza más los insumos de su receta. El ERP ya sabe el
costo de cada combinación (la pieza por `stock.bodega_model_id` y los insumos por
`reglas_insumo`), y la fórmula de Bodega ya trata los insumos aparte: la ganancia sale de la
fabricación y el insumo se suma al costo (`precios.ts:779`, `preciosPorCanal`). Con las dos cosas,
el ERP puede calcular el precio exacto de cada combinación.

## Requisitos
- **REQ-1** — El ERP debe calcular, para cada combinación activa, el precio de ML, el de la web y el
  de personalizados.
- **REQ-2** — El cálculo debe usar la misma fórmula que la calculadora de Bodega, con los gastos de
  venta que subió Bodega (spec 002) y la política (margen y redondeo) del modelo de Bodega de la
  pieza.
- **REQ-3** — El costo de la combinación debe salir de lo que ya calcula el ERP: fabricación de la
  pieza con el precio de su material (spec 001), más sus insumos de Bodega, más el costo de cada
  insumo de su receta.
- **REQ-4** — El precio de venta del ERP (el que propone el diálogo de pedido a mano) debe pasar a
  ser el de personalizados, aplicado desde la pantalla de Precios (spec 004).

## Reglas de negocio
- **RN-1** — Entradas de la fórmula para una combinación:
  - La **pieza** de la combinación: la de su opción del grupo "otra pieza" (un color, un diseño) o,
    si el producto no tiene ese grupo, la del producto (SDD 004, spec 003).
  - `fabricacion` = fabricación de esa pieza con el precio de su material (`fabricacionDePieza`,
    SDD 004, spec 007).
  - `insumos` = insumos de la pieza en Bodega + el insumo de su grupo "insumo" si es "Con X"
    (costo del insumo × cantidad). El costo de un insumo que es pieza de Bodega (una funda) es su
    fabricación + sus insumos.
  - `gastos` = los de Bodega, con `margenMinorista` reemplazado por el del modelo si lo tiene.
  - `redondeo` = el del modelo, o el global.
- **RN-2** — Para una combinación sin insumos de receta, el resultado es el mismo número que muestra
  la calculadora de Bodega para ese modelo (tolerancia $1). Es la prueba de que la fórmula es la
  misma.
- **RN-3** — Unidades (packs, spec 004 de la 001): una clave de canal con unidades N vale N × el
  precio unitario del tramo por cantidad que corresponde a N, sobre el precio de ese canal (los
  tramos de hoy: desde 5, 10 % menos; desde 10, 20 %; desde 20, 30 %). Si N es menor a 5, N × el
  precio unitario.
- **RN-4** — Precio de venta del ERP: el del producto = personalizados de su combinación más barata
  (la "Sin …" de un insumo, el color más barato, o el producto solo); el adicional de cada opción =
  la diferencia entre su combinación y esa base. Así el diálogo de pedido suma lo mismo que da la
  combinación.
- **RN-5** — Sin dato no hay precio: una combinación cuya pieza no está enlazada a Bodega, o cuyo
  modelo de Bodega nunca se costeó, o con un insumo sin costo, queda "falta costear" y no se
  propone nada para ella.

## Criterios de aceptación
- [ ] **CA-1** — Dado "Tanjiro 95" sin insumos, cuando el ERP calcula su combinación "Sin Funda",
  entonces los tres precios coinciden con los de la calculadora de Bodega para ese modelo.
- [ ] **CA-2** — Dada "Tanjiro 95 · Con Funda", entonces su precio de ML es el de la calculadora de
  Bodega para "Tanjiro 95" con el costo de la funda cargado como insumo.
- [ ] **CA-3** — Dada una clave del Shop "Pack · 10 unidades" de un llavero de precio web $2.800,
  entonces su precio es 10 × $2.240 (20 % menos), redondeado como el modelo.
- [ ] **CA-4** — Dada una combinación cuya funda no tiene costo de Bodega, entonces queda "falta
  costear" y no aparece ningún precio propuesto.

## Casos borde
- Un producto con colores o diseños (grupo "otra pieza"): cada opción es su pieza y tiene su costo y
  su precio. Con "solo decoración" (las firmas del vaso), todas cuestan lo mismo.
- Una combinación de dos accesorios (Kitetsu con funda y exhibidor): suma los dos insumos.
- Bodega todavía no subió gastos de venta: se usan los medidos de Bodega (`GASTOS_MEDIDOS`) y la
  pantalla lo avisa.

## Fuera de alcance
- Un margen por combinación: el margen es del modelo de Bodega.
- Promociones o descuentos temporales.

## Preguntas abiertas
Ninguna.

## Referencias
- `Bodega/Bodega3D-App/src/renderer/src/lib/precios.ts` (la fórmula; 846 líneas, sin dependencias
  fuera de `calc.ts` y `types`).
- `inventario_sendero3d/src/lib/costos-bodega.ts:136` (`costosPorFilaDeStock`).
- `inventario_sendero3d/src/lib/recetas.ts` (`recetaDeCombinacion`).
- `inventario_sendero3d/src/app/(app)/pedidos/pedido-dialog.tsx` (precio de venta + adicionales).
