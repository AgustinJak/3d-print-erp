---
id: 005-cambios-en-bodega
feature: 006-precios-en-el-erp
titulo: Bodega deja de calcular precios y sube sólo los datos del taller
estado: draft
actualizado: 2026-10-29
---

# Cambios en Bodega

## Requisitos

- **REQ-1** La calculadora muestra el costo de fabricación (tiempo, gramos, material, insumos) y
  guarda esos datos. Sin gastos de venta, margen, promo, redondeo ni precios.
- **REQ-2** La ficha de la pieza deja de mostrar precios; un link lleva al producto en el ERP.
- **REQ-3** Deja de subir `gastos_venta`, la política de la pieza y la foto de precios. Los
  parámetros de la máquina y los materiales se siguen subiendo, como hoy.

## Reglas de negocio

- **RN-1** Se publica después de que el ERP ya no lea nada de eso: si Bodega deja de subir antes,
  el ERP se queda sin gastos de venta.
- **RN-2** Las columnas viejas de `bodega.*` no se borran en esta feature: quedan sin uso hasta que
  se confirme que nada las lee.
