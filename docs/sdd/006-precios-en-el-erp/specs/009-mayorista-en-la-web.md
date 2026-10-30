---
id: 009-mayorista-en-la-web
feature: 006-precios-en-el-erp
titulo: Envío gratis desde $40.000 con reserva en el precio, y descuentos por cantidad que no pierden plata
estado: draft
actualizado: 2026-10-30
---

# Mayorista en la web

## Contexto

Pedido de Agustín, 2026-10-30: con el precio de la web al 35 % de margen, que los descuentos por
cantidad dejen 5 u → 30 %, 10 u → 25 %, 20 u → 20 %, sin sacarle el envío gratis a los pedidos por
cantidad y sin perder plata.

El Shop tiene **un solo juego de tramos para toda la web** (`configuracion.descuento_tramos`, hoy
"5:10, 10:20, 20:30") y uno por lista mayorista; envío gratis desde $34.000 de carrito
(`configuracion.envio_gratis_desde`).

## Cómo se llegó (2026-10-30)

1. **Metas 30 / 25 / 20 con el envío gratis del Shop**: un pedido de 5 u pasa el umbral y el envío
   (~$6.800) se come más que la diferencia entre 35 y 30 %. Para que todos llegaran: 0 / 0 / 4 %.
2. **Envío gratis siempre, con el envío entero adentro de cada precio**: los tramos daban
   16 / 25 / 31 %, pero cada producto sumaba ~$7.000; un collar de $8.800 en ML pasaba a ~$15.000 en
   la web. Descartado: la web tiene que ser la más barata.
3. **Cómo lo hacen las tiendas**: el umbral se pone con *ticket promedio + envío ÷ margen*
   ($26.700 + $6.855 ÷ 0,35 ≈ $46.000) o *ticket promedio + 20–30 %* (≈ $32.000–35.000), y el envío
   gratis se paga con un **% repartido en todos los precios**, como una comisión. Con los pedidos de
   la web de abril a octubre (78; 49 con envío, 29 retiros), un umbral de $40.000 se habría llevado
   el **1,6 %** de lo vendido.
4. **Con $40.000 y una reserva de 3 %**, los pedidos por cantidad siguen pasando el umbral y ningún
   juego único de tramos cumple 30 / 25 / 20 en todos (daba 0 / 4 / 10 %). Agustín eligió fijar los
   tramos y que la meta sea un piso.

## Decisión (Agustín, 2026-10-30)

- **Envío gratis desde $40.000** en la web, también en los pedidos por cantidad. Debajo, lo paga el
  cliente.
- **Reserva para el envío gratis: 3 % de cada precio de la web** (`webEnvioReservaPct`). Se mide
  con los pedidos (envío absorbido / lo vendido) y se ajusta.
- Un producto que solo ya pasa los $40.000 lleva su envío adentro del precio, sin margen y sin
  reserva (`precioWeb`).
- **Tramos: 5 u 8 %, 10 u 12 %, 20 u 18 %** (`TRAMOS_WEB`), uno para todos los productos.
- **Pisos**: 5 u 18 %, 10 u 17 %, 20 u 14 %: lo que deja el peor producto con su pedido mínimo.

Informe del 2026-10-30:

| Tramo | Descuento | Piso | Peor producto | Mediana |
|---|---|---|---|---|
| 5 u | 8 % | 18 % | 18 % (Bola de JoJo's metalizada) | 26 % |
| 10 u | 12 % | 17 % | 17 % (Mano exhibidora) | 26 % |
| 20 u | 18 % | 14 % | 14 % (Collar K4os) | 23 % |

Ningún producto pierde plata en ningún tramo. La venta suelta deja 30–35 %.

## Requisitos

- **REQ-1** El precio de la web: margen 35 % sobre el precio, con la reserva como un gasto más de
  la web; si el producto solo pasa el umbral, con su envío adentro y sin reserva.
- **REQ-2** `margenesDeTramos` mide lo que deja cada tramo de cada producto en su pedido mínimo,
  con el envío real del pedido (no la reserva).
- **REQ-3** Umbral, reserva, tramos y pisos son parte de la configuración (spec 001).
- **REQ-4** Precios › Configuración muestra, por tramo, el peor producto, la mediana y los que
  perforan el piso. Un producto nuevo que perfore un piso avisa.
- **REQ-5** La reserva se compara cada mes con lo que de verdad se absorbió en envíos gratis
  (pedidos del Shop): si se aleja más de un punto, se avisa para ajustarla.

## Reglas de negocio

- **RN-1** Una compra por cantidad en la web paga lo mismo que una suelta: cobro, publicidad e IIBB.
- **RN-2** La reserva no es un gasto del pedido por cantidad: ese pedido cuenta su envío de verdad.
- **RN-3** Debajo de los $40.000 el cliente paga el envío más la reserva del precio (~$300 en un
  producto de $10.000). Es el costo de que arriba sea gratis.

## Lo que hay que cambiar en el Shop

**No necesita código.** Agustín lo carga en el panel del Shop:

- `envio_gratis_desde` = 40000 (hoy 34000).
- `descuento_tramos` = "5:8, 10:12, 20:18" (hoy "5:10, 10:20, 20:30").

Los dos se pueden cambiar ya: dan menos envío gratis y menos descuento que hoy. La reserva entra
cuando se apliquen los precios nuevos (TASK-009).

## Criterios de aceptación

- **CA-1** Con los tramos elegidos, ningún producto perfora el piso de su tramo (± medio punto).
- **CA-2** Un pedido de 5 u de $10.000 con 8 % (5 × $9.200 = $46.000) cuenta el envío repartido en
  5 y no la reserva; uno de 5 u de $5.000 no pasa el umbral y no cuenta envío.
- **CA-3** `descuentosParaMargen` con metas 30 / 25 / 20, sin envío y gastos sólo porcentuales, da
  8 / 15 / 21 %.

## Fuera de alcance

- Las listas mayoristas del Shop (`mayorista_listas`): tienen sus propios tramos y precios, y hoy
  están inactivas.
- Los kits mayoristas, con su descuento extra.
- El costo real del correo por pedido: se usa el promedio de la configuración.
