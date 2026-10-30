---
id: 010-avisos-de-promo
feature: 006-precios-en-el-erp
titulo: Promos de ML desde el ERP — avisos, campañas por publicación y prender en cantidad, a mano
estado: draft
actualizado: 2026-10-30
---

# Avisos de promo

## Contexto

Pedido de Agustín, 2026-10-30: un aviso cuando un producto que debería estar con la promo del 10 %
(o la que corresponda) no la tiene, consumiendo la API de ML para ver las promociones de cada
publicación y las campañas activas de ML a las que se puede sumar.

El precio publicado ya viene inflado por la promo (spec 003): si la promo no está activa, el
cliente paga ese precio inflado, un 11 % más de lo calculado, y vende menos. Al revés, si hay una
promo y el precio no estaba inflado, se pierde ese %.

**La API de promociones de ML (`/seller-promotions/...`)** daba 403 también para leer. El 2026-10-30
Agustín habilitó "Promociones, cupones y descuentos" (lectura y escritura) en el DevCenter y
reconectó la cuenta en el ERP: el token trae `urn:ml:mktp:offers:/read-write` y ya contesta.
`/seller-promotions/users/{id}` da las campañas del vendedor y de ML (14 ese día: LIGHTNING, DEAL,
SELLER_CAMPAIGN, SELLER_COUPON_CAMPAIGN, SMART…); `/seller-promotions/items/{id}` da, por
publicación, en cuál está (`started`) y a cuáles se puede sumar (`candidate`, con precio sugerido,
mínimo y máximo). Una publicación inactiva contesta 400.

Además, cada "Leer precios de ML" ya guarda el precio standard (`/items/{id}/prices`), lo que paga
el cliente (`/items/{id}/sale_price`) y la promoción que gana (tipo, campaña, fin).

## Requisitos

- **REQ-1** Con cada lectura de ML, por publicación: la promo esperada (la de la pieza o la general,
  0 si la regla del umbral la saca), la que tiene (`1 − paga / standard`, con su tipo y fin), y un
  aviso si no coinciden.
- **REQ-2** Tres avisos, en la fila de Precios y en un filtro "con aviso de promo":
  - **Sin promo**: el precio está inflado para una promo que no está activa. El cliente paga de más.
  - **Promo distinta**: tiene una promo de otro % (por ejemplo una campaña de ML de 15 %), y deja
    otra plata que la calculada. Se muestra cuánto deja.
  - **Promo de más**: tiene promo y el precio no estaba inflado (la regla de los $30.000 la sacaba,
    o es un precio fijo).
- **REQ-3** Las campañas a las que se puede sumar cada publicación (`candidate`), con su %, sus
  fechas y el precio sugerido, y cuánto dejaría a ese precio.
- **REQ-4** **Prender promos desde el ERP, nunca solo** (Agustín, 2026-10-30): una pantalla de promos
  con las campañas activas (las suyas y las de ML). Por campaña, las publicaciones aptas
  (`candidate`), con el % que pide o deja ML (mínimo y máximo, sugerido) y lo que dejaría cada una a
  ese precio. Se eligen varias y se prenden juntas, con vista previa antes de confirmar.
- **REQ-5** Sólo se ofrece una campaña a una publicación apta para ella. Si el % que pide es mayor que
  el esperado (10 %), se avisa y se muestra lo que deja; no se bloquea: a veces conviene.
- **REQ-6** Aviso de publicaciones activas **sin campaña** (o con una que vence en menos de 3 días),
  con las campañas a las que se pueden sumar.
- **REQ-7** Cambiar el % de una publicación que ya está en una campaña propia, y sacarla de una
  campaña. Cada cambio queda registrado (quién, cuándo, antes y después).

## La API (probado el 2026-10-30 con el Carrete, MLA3189980034)

- **Modificar** el precio en una campaña donde ya está: `PUT /seller-promotions/items/{id}?app_version=v2`
  con `{ promotion_id, promotion_type, deal_price }`. El Carrete pasó de $3.610 (5 %) a $3.420 (10 %)
  en "Q4"; `sale_price` lo mostró al instante y `/seller-promotions/items` siguió diciendo $3.610 un
  rato.
- **Sumar** a una campaña: `POST` al mismo path con el mismo cuerpo. Si ya está en esa campaña, ML
  contesta 200 con el precio de antes y no cambia nada: hay que verificar con `sale_price`.
- **Sacar**: `DELETE /seller-promotions/items/{id}?promotion_type=…&promotion_id=…&app_version=v2`,
  sin probar todavía.
- El precio de la promo tiene que estar entre `min_discounted_price` y `max_discounted_price` de la
  candidata. En las campañas propias (`SELLER_CAMPAIGN`, `PRICE_DISCOUNT`) entra el 10 %; las de ML
  (DEAL, SMART, LIGHTNING) suelen pedir más, y Agustín observó que si se sube el precio piden más
  todavía.
- La documentación de ML (developers.mercadolibre.com.ar) no se deja leer de forma automática (403).

## Reglas de negocio

- **RN-1** Tolerancia: medio punto, por el redondeo del publicado.
- **RN-2** Una promo que termina en menos de 3 días también avisa ("vence el …").
- **RN-3** Las publicaciones de Shay no avisan.

## Criterios de aceptación

- **CA-1** Una publicación con el precio inflado 10 % y sin promo activa aparece con "Sin promo" y
  lo que paga el cliente.
- **CA-2** Una con una campaña de ML de otro % aparece con "Promo distinta" y la ganancia a ese
  precio.

## Pendiente de Agustín

- ~~Permiso de promociones~~ Habilitado y reconectado el 2026-10-30.
- ~~Si el ERP prende las promos~~ Sí, a mano y en cantidad (REQ-4 a REQ-7). Probado con el Carrete.
