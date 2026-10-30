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
- **Prender o apagar** no se probó: es público (cambia la promesa de entrega). Lo esperable es `POST`
  y `DELETE` sobre `/flex/sites/MLA/items/{id}/v2`; se prueba con un producto que elija Agustín.
