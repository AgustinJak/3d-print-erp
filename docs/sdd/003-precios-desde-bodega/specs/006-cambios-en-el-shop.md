---
id: 006-cambios-en-el-shop
feature: 003-precios-desde-bodega
titulo: El Shop recibe del ERP el precio de cada combinación de un producto y lo traduce a su base, extras y reglas
estado: draft
actualizado: 2026-10-20
---

# Cambios en el Shop

> [!info] La implementa la sesión del Shop
> Es un contrato nuevo y va en la dirección contraria a los de hoy: el ERP le escribe al Shop.
> El ERP sólo lo llama desde la pantalla de Precios, con aprobación de Agustín.

## Contexto
El Shop guarda el precio de un producto como **base + extra por opción + reglas condicionales**:
la Tanjiro (Negra) es $23.000, +$10.000 la de 95 cm, +$10.000 con funda, y la funda pasa a
+$20.000 cuando es de 95 (`productos.precio`, `variante_opciones.precio_adicional`,
`variante_precio_reglas`; 16 reglas al 2026-10-20). Algunos productos tienen además un precio de
oferta (`productos.precio_oferta`). El ERP piensa en otra unidad: el precio final de cada
combinación (spec 003). Traducir de una a la otra es cosa del Shop, que conoce su modelo.

## Requisitos
- **REQ-1** — El Shop debe exponer un endpoint firmado que reciba, por producto, el precio final de
  cada combinación de opciones (ids de la spec 005 del SDD 001).
- **REQ-2** — Con `simular: true` debe devolver, por combinación, lo que paga hoy el cliente y lo
  que pagaría, y cómo quedaría la base, los extras y las reglas, sin escribir nada.
- **REQ-3** — Sin `simular`, debe escribir base, extras y reglas de modo que lo que paga el cliente
  por cada combinación sea exactamente el precio recibido.
- **REQ-4** — Si un producto no se puede representar exactamente, o le faltan combinaciones, no
  debe escribir nada de ese producto e informar por qué.

## Reglas de negocio
- **RN-1** — Pedido:
  ```json
  {
    "simular": true,
    "productos": [
      {
        "producto_id": "b4512241-…",
        "combinaciones": [
          { "opcion_ids": ["<65cm>", "<Sin Funda>"], "precio": 24990 },
          { "opcion_ids": ["<65cm>", "<Con Funda>"], "precio": 34990 },
          { "opcion_ids": ["<95cm>", "<Sin Funda>"], "precio": 34990 },
          { "opcion_ids": ["<95cm>", "<Con Funda>"], "precio": 54990 }
        ]
      },
      { "producto_id": "463f6cb9-…", "combinaciones": [{ "opcion_ids": [], "precio": 14990 }] }
    ]
  }
  ```
  Respuesta por producto: `estado` (`ok` | `sin_cambio` | `no_representable` | `faltan_combinaciones`
  | `no_existe`), y por combinación `actual` y `nuevo`.
- **RN-2** — Firma: la misma HMAC-SHA256 del contrato 1, sobre `` `${timestamp}.${rawBody}` ``, con
  los headers `x-inventario-signature` y `x-inventario-timestamp` (segundos) y el mismo secreto
  que ya comparten (`INVENTARIO_WEBHOOK_SECRET` en el Shop, `SHOP_WEBHOOK_SECRET` en el ERP).
- **RN-3** — Hay que mandar **todas** las combinaciones de las opciones activas del producto; si
  falta alguna, `faltan_combinaciones`.
- **RN-4** — El precio es **lo que paga el cliente**. Si el producto tiene precio de oferta, lo
  nuevo va a la oferta y el precio tachado conserva la proporción que tiene hoy con la oferta.
- **RN-5** — La traducción la decide el Shop. Una que sirve: base = la combinación con la primera
  opción de cada grupo; extra de cada opción = la diferencia contra la base; lo que no cierra con
  dos grupos va a reglas. Con tres grupos o más (Kitetsu), si las reglas de a pares no alcanzan,
  `no_representable`.
- **RN-6** — Sólo precios: el endpoint no crea ni borra productos ni opciones, ni toca stock,
  nombres o fotos.
- **RN-7** — Idempotente: mandar dos veces lo mismo no cambia nada la segunda (`sin_cambio`).

## Criterios de aceptación
- [ ] **CA-1** — Dado el pedido de RN-1 con `simular: true`, entonces responde los cuatro precios
  actuales de la Tanjiro ($23.000, $33.000, $33.000, $53.000: la regla reemplaza el extra de la
  funda, no lo suma, como se cobró en SS-00136) y los nuevos, sin escribir.
- [ ] **CA-2** — Sin `simular`, el carrito del Shop cobra $54.990 por la Tanjiro 95 con funda.
- [ ] **CA-3** — Dado un producto al que le falta una combinación, entonces `faltan_combinaciones` y
  el producto no cambia.
- [ ] **CA-4** — Una firma inválida responde 401 y no escribe nada.

## Casos borde
- Un producto inactivo o borrado: `no_existe`.
- Un pedido ya iniciado en el checkout con el precio viejo: se cobra lo que diga el Shop hoy al
  confirmarse (comportamiento actual del Shop, no cambia).

## Fuera de alcance
- Stock y disponibilidad en la web: es la feature 002.
- Que el Shop le pida precios al ERP: el ERP manda, con aprobación.

## Preguntas abiertas
Ninguna para el ERP. La traducción exacta (RN-5) la define la sesión del Shop en su SDD.

## Referencias
- `Shop/sendero-shop/src/lib/inventario-webhook.ts` (la firma que ya existe, en el otro sentido).
- Cerebro: `Flujos del ecosistema` (contrato 1).
