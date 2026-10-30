---
id: 001-configuracion-de-precios
feature: 006-precios-en-el-erp
titulo: La configuración de precios vive en el ERP
estado: draft
actualizado: 2026-10-30
---

# Configuración de precios

## Contexto

Hoy los gastos de venta, el margen, la promo y el redondeo generales se cargan en la calculadora de
Bodega (`bodega.cost_settings.gastos_venta`) y el ERP los lee. La promo de ML no tiene ni un campo
propio: quedó en 18,9 % sin que nadie lo viera.

## Requisitos

- **REQ-1** Una sección "Configuración" en Precios con: margen objetivo (35 %, el mismo en la web
  y en ML), los tramos por cantidad de la web y sus pisos, y la reserva para el envío gratis
  (spec 009, en lugar del piso mayorista), promo de ML, redondeo, publicidad de ML (%), IIBB, otros cargos de ML, umbral y
  costo de envío de ML por defecto, y cobro, publicidad y envío de la web.
- **REQ-2** Migración única desde `bodega.cost_settings.gastos_venta`, con la promo de ML en 10 %,
  el margen en 35 %, el envío gratis de la web desde $40.000 y la reserva para ese envío en 3 % de
  cada precio (decisión de Agustín, 2026-10-30; spec 009). Bodega tiene el umbral en 0, que en la
  fórmula quiere decir "el envío lo pagamos siempre": no se migra.
- **REQ-3** Cada cambio queda con fecha y quién, para saber desde cuándo cambió un precio.

## Reglas de negocio

- **RN-1** Comisión, cargo fijo y cuotas de ML dejan de ser parámetros: salen de ML (spec 003).
  Quedan sólo como respaldo para cuando ML no conteste, y lo que se calcule con ellos se marca
  como estimado.
- **RN-2** Cada campo dice qué afecta, con un ejemplo en pesos.
- **RN-3** El margen es **sobre el precio de venta**, no markup sobre el costo (decisión de Agustín,
  2026-10-30): precio = costo total (impresión + insumos) / (1 − gastos variables del canal −
  margen). La pantalla muestra los dos: el margen y el markup que da.

## Criterios de aceptación

- **CA-1** Después de migrar, el precio de la web de una combinación es costo / (1 − gastos de la web
  − 35 %), redondeado, sin el piso mayorista. (Era "dan lo mismo que antes"; dejó de valer con el
  margen nuevo, 2026-10-30.)
- **CA-2** El precio de ML de una pieza que no tenía promo propia cambia sólo por la promo (18,9 % →
  10 %) y por la comisión real (spec 003).

## Fuera de alcance

- Los parámetros de la máquina y los materiales: se quedan en Bodega.
