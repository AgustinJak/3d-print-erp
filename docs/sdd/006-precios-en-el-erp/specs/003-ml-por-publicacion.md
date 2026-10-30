---
id: 003-ml-por-publicacion
feature: 006-precios-en-el-erp
titulo: Un precio por publicación de ML, con su comisión, cargo fijo, cuotas y envío reales
estado: draft
actualizado: 2026-10-30
---

# ML por publicación

## Contexto

Un producto puede tener en ML una Clásica sin cuotas ni envío gratis y una Premium con cuotas y
envío gratis, más cara para dejar la misma plata. Hoy Precios les propone a las dos el mismo
precio: al Angel Premium (MLA3706336496, $45.490) le proponía $29.434, −35 % y sin la campaña.

Lo verificado en ML el 2026-10-28, sólo leyendo:

- `/items` trae `listing_type_id` (`gold_special` Clásica, `gold_pro` Premium),
  `shipping.free_shipping`, `category_id` y la campaña de cuotas (`INSTALLMENTS_CAMPAIGN`).
- `/sites/MLA/listing_prices?price&category_id` devuelve, para cada tipo, el % de ML, el recargo
  por cuotas y el cargo fijo a ese precio.
- `/users/{id}/shipping_options/free?item_id` devuelve lo que cuesta el envío gratis ($10.790 el
  Angel).

## Requisitos

- **REQ-1** "Leer precios de ML" trae además, por publicación: tipo, envío gratis y su costo,
  categoría, campaña de cuotas y la comisión de ML para su tipo y categoría.
- **REQ-2** El precio propuesto de cada publicación es el que deja la ganancia del producto con
  esos costos.
- **REQ-3** La fila de Precios muestra el porqué: tipo, cuotas, envío gratis y cuánto se lleva ML.

## Reglas de negocio

- **RN-1** Comisión: la de la categoría para la Clásica; en la Premium, más el recargo por cuotas.
- **RN-2** Cargo fijo según el precio que paga el cliente, por tramos, leídos de ML. El 2026-10-28:
  menos de $15.000, $1.330; de $15.000 a $24.000, $2.740; de $24.000 a $33.000, $3.320; desde
  $33.000, $0.
- **RN-3** Envío: con envío gratis, su costo real; sin envío gratis, la regla del umbral de siempre
  (ML lo obliga desde $30.000).
- **RN-4** El recargo por cuotas se confirma con lo que ML cobró en ventas reales de esa
  publicación antes de usarlo. Agustín dice 8,9 % para 3 cuotas; el cotizador da 12,9 %.
- **RN-6** La promo infla el publicado para que el cliente pague el precio calculado, **salvo que
  el inflado lo publique arriba de $30.000** cuando el cliente paga menos: ahí no se aplica la
  promo y se publica el precio final (decisión de Agustín, 2026-10-30). Vale para las dos opciones.
  En el informe del 2026-10-30, 4 productos.
- **RN-5** Si ML no contesta, se usan los valores de respaldo de la configuración y la fila se
  marca como estimada.

## Criterios de aceptación

- **CA-1** Para el Angel, la Premium con 3 cuotas y envío gratis da unos $45.000 y la Clásica unos
  $29.000, y las dos dejan la misma ganancia (±$200 por redondeo).
- **CA-3** Un producto que el cliente paga $28.000 con promo 10 % se publica a $28.000, no a
  $31.112. Uno de $26.000 se publica a $28.889.
- **CA-2** Una Clásica sin envío gratis de una categoría al 14 % da un precio más alto que hoy (11,3
  % + $1.053) cuando su precio cae en un tramo de cargo fijo alto.
