---
id: 001-catalogo-de-materiales
feature: 003-precios-desde-bodega
titulo: Cada modelo de Bodega se costea con el precio de su material, no con uno solo para todo
estado: validated
actualizado: 2026-10-20
---

# Catálogo de materiales

## Contexto
Bodega costea todo con un único precio de filamento por kilo (`calc_precioKg`). Agustín usa
materiales y marcas distintos que valen distinto. Si en la calculadora se pone otro precio, el
costeo se guarda, pero la ficha del modelo lo recalcula con el global
(`Bodega/Bodega3D-App/src/renderer/src/pages/ModeloDetalle.tsx:34-58`). El ERP también usa el
global (`inventario_sendero3d/src/lib/costos-bodega.ts`, `fabricacionDeReceta`). Como los precios
de esta feature salen del costo, un costo con el filamento equivocado da un precio equivocado
en la web y en ML.

## Requisitos
- **REQ-1** — Bodega debe tener un catálogo de materiales: nombre (marca + tipo, por ejemplo
  "GST3D PLA"), precio por kilo, y cuál es el de por defecto.
- **REQ-2** — Cada modelo de Bodega debe poder elegir su material; vacío = el de por defecto.
- **REQ-3** — La calculadora debe usar el precio del material del modelo, y guardar cuál usó.
- **REQ-4** — La ficha del modelo en Bodega debe recalcular con el precio de **su** material.
- **REQ-5** — El catálogo y el material de cada modelo deben subir al ERP con la sincronización de
  siempre, y el ERP debe costear cada pieza con el precio de su material.

## Reglas de negocio
- **RN-1** — Cambiar el precio de un material mueve el costo de todos los modelos que lo usan, en
  Bodega al abrirlos y en el ERP en la próxima pasada (la misma regla de hoy: viaja la receta, no
  el resultado).
- **RN-2** — Hay siempre exactamente un material por defecto. Al crear el catálogo, el primero
  nace con el `calc_precioKg` de hoy y como por defecto: ningún costo cambia el día de la
  migración.
- **RN-3** — Un material que usa algún modelo no se borra: se desactiva, y los modelos que lo
  tenían siguen costeándose con él hasta que se les elija otro.
- **RN-4** — El resto de los parámetros (luz, desgaste, margen de error) siguen siendo globales.

## Criterios de aceptación
- [ ] **CA-1** — Dado un modelo con material "PLA premium" a $25.000/kg, cuando se abre su ficha,
  el costo de material es gramos × 25, no gramos × el precio por defecto.
- [ ] **CA-2** — Cuando se cambia el precio de "PLA premium", entonces la ficha de ese modelo y el
  costo de su pieza en el ERP cambian, y los modelos con otro material no.
- [ ] **CA-3** — Dado el día de la migración, entonces el costo de cada pieza en el ERP es el
  mismo que el día anterior.

## Casos borde
- Un modelo sin material elegido: usa el de por defecto, y si el por defecto cambia, lo sigue.
- La cola de impresión tiene un campo `material` de texto libre: no se toca en esta feature.
- Bodega sin conexión: el catálogo sube en la próxima vuelta de la sincronización, como todo.

## Fuera de alcance
- Stock de filamento (cuántos kilos quedan).
- Reusar la tabla `filamentos` del ERP: queda como está (ver la decisión en el SDD funcional).

## Preguntas abiertas
Ninguna.

## Referencias
- `Bodega/Bodega3D-App/docs/sdd/README.md`, "Pendientes sin SDD todavía" (se mueve acá).
- `Bodega/Bodega3D-App/src/main/sync.ts:169` (`subirParametrosDeCosto`), `:246` (`bodega_models`).
- `inventario_sendero3d/src/lib/costos-bodega.ts:68` (`fabricacionDeReceta`), `:107` (`leerRecetas`).
