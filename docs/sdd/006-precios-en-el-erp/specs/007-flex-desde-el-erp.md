---
id: 007-flex-desde-el-erp
feature: 006-precios-en-el-erp
titulo: Activar o desactivar Envíos Flex de una publicación desde el ERP
estado: draft
actualizado: 2026-10-29
---

# Flex desde el ERP

## Contexto

Agustín activa Flex a mano en el panel de ML. Pidió poder prenderlo y apagarlo desde el ERP
(2026-10-29).

## Requisitos

- **REQ-1** En Precios, por publicación, ver si tiene Flex y prenderlo o apagarlo.
- **REQ-2** Prender o apagar varias de una vez (por ejemplo, todas las de un producto).
- **REQ-3** Antes de construir, TASK-015 verifica en la doc de ML cómo se hace por API y si la
  cuenta y la app tienen permiso. Si ML no lo permite, se dice y la spec se cierra.

## Reglas de negocio

- **RN-1** Cambiar Flex es un cambio en ML: vista previa, confirmación y registro, como los precios.
- **RN-2** Flex no cambia la fórmula del precio en esta feature.

## Lo que se verificó (2026-10-30)

- **Leer** funciona: `GET /flex/sites/MLA/items/{id}/v2` contesta `{"has_flex": true}`, y la publicación
  trae `self_service_in` en `shipping.tags`. El ERP lo toma de ahí en cada "Leer precios de ML"
  (`LecturaMl.flex`) y la fila de Precios muestra la etiqueta "Flex".
- La cuenta tiene la logística `self_service` activa (`/users/{id}/shipping_preferences`).
- `GET /sites/MLA/shipping/selfservice/items/{id}` da 403.
- **Prender y apagar**, probado con el Carrete a pedido de Agustín: `DELETE /flex/sites/MLA/items/{id}/v2`
  lo apaga y `POST` lo prende (204 los dos). La publicación cambia al instante a `self_service_out` /
  `self_service_in`; el GET de Flex tardó unos 20 segundos. El Carrete quedó con Flex, como estaba.
- En Precios › Mercado Libre se tildan publicaciones (cualquiera, no sólo las que tienen precio
  nuevo) y "Prender Flex" / "Apagar Flex" muestran cómo están hoy, mandan al confirmar, verifican en
  la publicación y registran en `cambios_flex` (`src/lib/flex-ml.ts`, `POST /api/precios/flex`).

## Flex y tiempo de disponibilidad van juntos (2026-11-02)

Agustín avisó que una publicación con tiempo de disponibilidad no puede tener Flex, y cómo trabaja:

- **Con stock**: disponibilidad en 0 y Flex prendido (entrega en el día).
- **Sin stock**: Flex apagado y N días de disponibilidad, así las ventas entran igual pero para
  después. **El stock de ML nunca se deja en 0.**

La doc de ML ("Disponibilidad de stock", en Sincroniza y modifica publicaciones) lo confirma: el
sale_term `MANUFACTURING_TIME` ("15 días", hasta 60) no es compatible con Flex; si se pone en una
publicación con Flex, ML lo borra en segundo plano (warning `delete.item.sale_terms.manufacturing_time`).
Se saca con `PUT /items/{id}` mandando `value_id` y `value_name` en null.

- **REQ-4** Los botones pasan a ser dos modos de entrega: "Con stock: Flex" (saca la disponibilidad
  y prende Flex) y "Sin stock: a pedido" (apaga Flex y pone N días; arranca con los días que ya usa
  la mayoría de las elegidas, o 15).
- **RN-3** El orden importa: para inmediata, primero se saca la disponibilidad; para a pedido, primero
  se apaga Flex (si no, ML borra los días). Cada paso se verifica releyendo la publicación.
- **RN-4** El stock de ML (`available_quantity`) no se toca nunca.
- **RN-5** El stock del ERP se muestra como pista (en ámbar si contradice el modo elegido) pero no
  decide: el 2026-11-02, 79 publicaciones con Flex tenían stock 0 en el ERP, o sea que el stock del
  ERP no está al día para todo.
- Al sacar o poner días se manda la lista entera de sale_terms con sólo ese cambiado, para no perder
  garantía, factura ni cuotas sea cual sea la forma en que ML aplica el PUT.
- La fila de Precios muestra "a pedido, N días" (`LecturaMl.disponibilidad`, desde la próxima lectura).
- Foto del 2026-11-02 (activas): 87 a pedido con stock ERP 0, 79 inmediata+Flex con stock ERP 0,
  18 inmediata+Flex con stock, 6 a pedido con stock ERP 1 (Shinobu). Ninguna "a pedido" tiene
  `self_service_available`: falta ver si aparece al sacar los días.
- **Probado "con stock"** con la Shinobu Katana Sola (MLA3112623780), a pedido de Agustín, el 2026-11-02:
  el PUT con `MANUFACTURING_TIME` en null sacó los 15 días y dejó la garantía como estaba; al instante
  apareció `self_service_available` y el POST prendió Flex. El stock de ML (2) no se tocó. La etiqueta
  `self_service_in` tardó unos segundos más que la relectura, así que `cambios_flex` registró "error"
  aunque quedó bien: desde entonces se relee hasta 5 veces cada 2 s.
- **Probado "a pedido"** con el Carrete (MLA3189980034), a pedido de Agustín, el 2026-11-02: DELETE de Flex,
  después PUT con "15 días"; garantía y campaña de 3 cuotas intactas, stock de ML (17) sin tocar. Tardó
  15 s (la etiqueta de Flex apagado tarda), así que la pantalla manda de a 2. Después se volvió a
  inmediata con Flex, como estaba, y también quedó bien.
- En la prueba se cambió por error la Shinobu a "a pedido" (se buscó el Carrete en `cambios_flex` y la
  prueba del 2026-10-30 no estaba ahí); se volvió enseguida a inmediata con Flex.

## En Productos, y nunca automático (2026-11-02)

Agustín evaluó que la entrega siguiera sola al stock del ERP y lo descartó: la cambia él. Además de
Precios, la barra de Productos (productos tildados) tiene "Con stock: Flex" y "Sin stock: a pedido"
sobre sus publicaciones activas y pausadas (`GET /api/modelos/canales` trae `mlas` y cuántas tienen
Flex o están a pedido). Las lecturas guardadas se completaron con `flex` y `disponibilidad` ese día.
