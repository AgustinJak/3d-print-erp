# Para la sesión del Shop · endpoint de precios (SDD 003 del inventario, spec 006)

> Texto para pegar en la sesión del Shop. Lo escribió la sesión del inventario el 2026-10-24.
> La spec completa está en `inventario_sendero3d/docs/sdd/003-precios-desde-bodega/specs/006-cambios-en-el-shop.md`.

---

Hola. Te paso un pedido de la sesión del inventario. Es un **contrato nuevo, al revés de los de hoy: el ERP le escribe al Shop**. Sólo precios.

## Para qué

Agustín decide los precios en Bodega. El ERP ya calcula, con la misma fórmula que la calculadora de Bodega, el precio **final** de cada combinación que se vende (por ejemplo "Tanjiro 95 · Con Funda" = $54.990), y tiene una pantalla **Precios** donde Agustín ve lo publicado contra lo propuesto y aprueba. Para la web necesita que el Shop:

1. le diga cuánto paga hoy el cliente por cada combinación de un producto, y
2. reciba los precios nuevos y los traduzca a su modelo (base + extra por opción + `variante_precio_reglas`).

La traducción es del Shop, porque es quien conoce su modelo. El ERP sólo piensa en "esta combinación de opciones cuesta tanto".

## El endpoint

Propuesta: `POST /api/inventario/precios`. Si preferís otra ruta, avisale a Agustín y el ERP usa esa. Del lado del ERP la base del Shop va en la variable `SHOP_API_URL`.

**Firma:** la misma HMAC-SHA256 del webhook de pedidos, pero en el otro sentido.

- Se firma `` `${timestamp}.${rawBody}` `` con el secreto que ya comparten: `INVENTARIO_WEBHOOK_SECRET` en el Shop y `SHOP_WEBHOOK_SECRET` en el ERP. Es el mismo valor.
- Headers:
  - `x-inventario-signature`: el hex en minúsculas.
  - `x-inventario-timestamp`: en segundos.
- Timestamp fuera de ventana o firma inválida → **401 sin escribir nada**.

**Pedido:**

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

- `opcion_ids` son ids de `variante_opciones`, los mismos que el Shop ya manda en cada línea del webhook de pedidos (`variantes_seleccionadas[].opcion_id`, docs/sdd/017 del Shop).
- Un producto sin variantes va con `opcion_ids: []`.

**Respuesta**, un elemento por producto:

```json
{
  "productos": [
    {
      "producto_id": "b4512241-…",
      "estado": "ok",
      "motivo": null,
      "combinaciones": [
        { "opcion_ids": ["<65cm>", "<Sin Funda>"], "actual": 23000, "nuevo": 24990 }
      ],
      "cambios": { "precio_base": { "antes": 23000, "despues": 24990 }, "extras": [], "reglas": [] }
    }
  ]
}
```

`estado` puede ser:

| Estado | Qué significa |
|---|---|
| `ok` | Con `simular`, se puede aplicar. Sin `simular`, se aplicó. |
| `sin_cambio` | Ya está así. |
| `no_representable` | No hay base, extras y reglas que den exactamente esos precios. Va con `motivo`. |
| `faltan_combinaciones` | No vinieron todas las combinaciones de las opciones activas. Va con `motivo`. |
| `no_existe` | Producto inactivo o borrado. |

`actual` es lo que paga hoy el cliente. `cambios` es opcional, para que el ERP muestre qué se tocaría.

## Reglas

1. **Con `simular: true` no se escribe nada.** El ERP lo usa también para *leer* los precios de hoy: manda los precios propuestos y muestra el `actual` de la respuesta.
2. **Sin `simular`**, se escriben base, extras y reglas de modo que el cliente pague **exactamente** el precio recibido por cada combinación.
3. **Todo o nada por producto.** Si un producto no se puede representar exacto o le falta alguna combinación de sus opciones activas, no se escribe nada de ese producto y se dice por qué. Los demás productos del pedido sí se aplican.
4. **El precio es lo que paga el cliente.** Si el producto tiene `precio_oferta`, lo nuevo va a la oferta y el precio tachado conserva la proporción que tiene hoy con la oferta.
5. **Sólo precios.** No crea ni borra productos u opciones, ni toca stock, nombres, fotos o descripciones.
6. **Idempotente.** Mandar dos veces lo mismo deja `sin_cambio` la segunda.
7. **La traducción la decidís vos.** Una que sirve:
   - base = la combinación con la primera opción de cada grupo;
   - extra de cada opción = la diferencia contra la base;
   - lo que no cierra con dos grupos va a reglas.

   Con tres grupos o más (la Kitetsu), si las reglas de a pares no alcanzan, `no_representable`.

## Criterios de aceptación

- **CA-1**: con el pedido de arriba y `simular: true`, devuelve los cuatro precios actuales de la Tanjiro ($23.000, $33.000, $33.000, $53.000) y los nuevos, sin escribir. La regla reemplaza el extra de la funda, no lo suma, como se cobró en SS-00136.
- **CA-2**: sin `simular`, el carrito cobra $54.990 por la Tanjiro 95 con funda.
- **CA-3**: si a un producto le falta una combinación, la respuesta es `faltan_combinaciones` y el producto no cambia.
- **CA-4**: con una firma inválida responde 401 y no escribe nada.

## Qué hace el ERP con esto

- Agrupa sus claves del Shop (`<producto_id>|<opcion_ids>`, 149 claves de 51 productos al 2026-10-24) por producto y manda **todas** sus combinaciones.
- Nunca llama solo: sólo desde la pantalla Precios, con un click de confirmación de Agustín, y lo que cambia más de 30 % pide una confirmación aparte.
- Primero va a probar con `simular: true` contra producción. La primera escritura real va a ser un producto que elija Agustín.

## Documentación

Al terminar, actualizá `02 - Shop/SHOP - Flujos.md` (endpoint nuevo) y avisale a Agustín. Es un contrato entre sistemas, así que también va en `Flujos del ecosistema.md` como contrato nuevo ERP → Shop. Desde el lado del ERP lo anota la sesión del inventario cuando se destrabe el vault.
