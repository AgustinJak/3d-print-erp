---
id: 005-cambios-en-bodega
feature: 006-precios-en-el-erp
titulo: Bodega deja de calcular precios y sube sólo los datos del taller
estado: implemented
actualizado: 2026-11-02
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

## Cómo quedó (2026-11-02)

- **ERP primero (RN-1).** Con `config_precios` el ERP no lee `bodega.models` (margen, redondeo, promo,
  foto) ni `bodega.cost_settings.gastos_venta`. Antes tomaba de Bodega la promo y el redondeo de la pieza
  cuando el producto no tenía los suyos: había promo en 18 piezas, 17 iguales a la general (10 %) y la
  Funda Yamato 95cm en 0 %, que se copió a `modelos.promo_ml`. Ningún precio cambia. Sin `config_precios`
  (un tenant nuevo) se sigue calculando como en el SDD 003.
- **REQ-1.** La calculadora de Bodega muestra tiempo, gramos, material, insumos y lo que cuesta hacer la
  pieza; "Guardar costeo en la pieza" guarda eso y el material (`models:savePricing` ya no toca la política).
- **REQ-2.** La ficha muestra el costo de hoy y "Ver precios en el ERP": IPC `erp:abrirPieza` abre
  `/piezas/<id>` del ERP, que busca la fila de stock con ese `bodega_model_id` y redirige al producto (si
  son varios, los lista).
- **REQ-3.** La sincronización ya no manda `gastos_venta`, `margen`, `redondeo`, `promo_ml` ni `precios`.
  El upsert sólo toca las columnas que van, así que quedan con lo último subido (RN-2).
- Los parámetros de gastos que siguen en los settings locales de Bodega (`precio_*`) quedan sin uso.
