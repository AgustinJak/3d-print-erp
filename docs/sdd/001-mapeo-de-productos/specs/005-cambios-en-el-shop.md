---
id: 005-cambios-en-el-shop
feature: 001-mapeo-de-productos
titulo: El Shop manda ids estables del producto y de cada opción en el webhook
estado: implemented
actualizado: 2026-10-19
---

# Cambios en el Shop

> [!info] La implementa la sesión del Shop
> Es el único cambio que esta feature le pide al Shop. Es aditivo: el ERP acepta el payload de
> hoy y el nuevo.

> [!success] En producción desde el 2026-10-19
> El Shop la hizo en su `docs/sdd/017` (commit `5050b03`): `pedido.confirmado` manda
> `producto_id` por línea y `grupo_id` + `opcion_id` por opción, sacados de `pedido_items`; las
> líneas personalizadas van con `producto_id: null` y sin ids de opción.
>
> **Lo que no sabíamos al escribirla:** los ids de opción son estables recién desde ese deploy.
> Antes, "Guardar variantes" del admin del Shop borraba y recreaba todas las opciones del
> producto. Pedidos anteriores pueden traer ids que ya no existen (32 de 58 opciones al
> 2026-10-19, las Steel Ball hasta SS-00129): van tal cual y caen en la cola de mapeo. La regla
> de RN-3 vale desde ahora.
>
> Falta del lado del ERP: verificar el primer pedido que llegue con ids una vez desplegada la
> spec 004. El ERP de antes los descarta sin error (zod ignora los campos que no conoce):
> SS-00136 entró bien después del deploy del Shop.

## Contexto
El Shop ya guarda ids estables de lo que eligió el cliente: cada opción de
`pedido_items.opciones_seleccionadas` tiene `grupo_id` y `opcion_id`
(`Shop/sendero-shop/src/types/index.ts:98`, `VarianteSeleccion`). Pero el payload del webhook los
descarta y manda sólo los nombres (`Shop/sendero-shop/src/lib/inventario-payload.ts:45`). Con los
nombres el ERP tiene que adivinar; con los ids puede mapear una vez y no fallar más.

## Requisitos
- **REQ-1** — Cada línea del payload de `pedido.confirmado` debe incluir `producto_id`.
- **REQ-2** — Cada opción de `opciones_seleccionadas` debe incluir `grupo_id` y `opcion_id`.
- **REQ-3** — Los campos de hoy (`sku`, `nombre_producto`, `grupo`, `nombre`, `precio_extra`,
  `personalizado`) se siguen mandando igual.

## Reglas de negocio
- **RN-1** — `producto_id` es el uuid de `productos`; `null` en una línea `personalizado: true`.
- **RN-2** — Payload de una línea, después del cambio:

  ```json
  {
    "producto_id": "3f2a…",
    "sku": "SS-DEM-KAT-006",
    "nombre_producto": "Tanjiro Katana",
    "cantidad": 1,
    "precio_unitario": 45990,
    "opciones_seleccionadas": [
      { "grupo_id": "…", "grupo": "Tamaño", "opcion_id": "…", "nombre": "95cm", "precio_extra": 0 },
      { "grupo_id": "…", "grupo": "Accesorios", "opcion_id": "…", "nombre": "Con Funda", "precio_extra": 6000 }
    ],
    "personalizado": false
  }
  ```

- **RN-3** — Una opción borrada o renombrada en el Shop conserva su id en los pedidos viejos; una
  opción nueva tiene id nuevo y cae en la cola de mapeo del ERP (spec 004). Por eso **no hay que
  reutilizar una opción para algo distinto**: si cambia lo que es, se crea otra.

## Criterios de aceptación
- [ ] **CA-1** — Dado un pedido con una katana "95cm" + "Con Funda", entonces el payload trae
  `producto_id` y los dos `opcion_id`.
- [ ] **CA-2** — Dado un pedido a medida, entonces la línea personalizada trae `producto_id: null`.
- [ ] **CA-3** — Un reenvío de un pedido viejo (botón o cron) trae los ids, porque salen de
  `pedido_items`, no del catálogo actual.

## Casos borde
- Pedidos viejos con `opciones_seleccionadas` sin ids (si los hay): se mandan sin ids; el ERP usa
  la clave por SKU y nombres (spec 004, RN-1).

## Fuera de alcance
- Que el Shop deje de autogenerar SKUs (pendiente de la `Convención de SKU`, aparte).
- Cualquier cambio en el checkout o en el catálogo del Shop.

## Preguntas abiertas
Ninguna.

## Referencias
- `Shop/sendero-shop/src/lib/inventario-payload.ts:38-55`
- `Shop/sendero-shop/src/types/index.ts:98`
- Cerebro: `Flujos del ecosistema` (contrato 1)
