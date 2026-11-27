# SDD 019 · Cuánto se puede retirar, con la plata real

**Estado:** hecho el 2026-11-27 · **Pidió:** Agustín · **Hizo:** Claude

## Por qué

El 2026-11-27 Agustín decidió que Mercado Pago quede **sólo para la empresa** y que la ganancia se
retire a otra cuenta. La primera versión de "Se puede retirar hoy" partía de la billetera
empresarial y daba $1.220.877 cuando en Mercado Pago había $582.724: la billetera es la ganancia
acumulada desde el 1/11, no ve lo de octubre que se pagó en noviembre (facturas de ML, Shay,
convenio), ni lo de la casa que salió de la cuenta, ni la plata de Shay. Se sacó de la pantalla ese
mismo día.

## Qué hace

En Finanzas, arriba de las billeteras:

```
saldo de Mercado Pago (el último leído)
  − lo de Shay de los meses sin pagar (desde octubre de 2026)
  − los resúmenes de la tarjeta sin pagar, enteros
  − lo que va a facturar ML: el mes en curso y, hasta el 12, el anterior
  − los gastos con fecha en los próximos 30 días que no son cuotas
  − lo que se le debe al repartidor
  = se puede retirar (si da negativo: "Hoy no", y cuánto falta)
```

y se reparte por los porcentajes de Socios.

## Decisiones (2026-11-27)

| Decisión | Por qué |
|---|---|
| **Parte del saldo real**, no de la billetera | La billetera es ganancia, no plata en la cuenta |
| **El saldo se lee con un botón** ("Leer saldo de Mercado Pago") | La API no da el saldo en el momento: sale del reporte de liberaciones, que tarda de 15 segundos a 2 minutos |
| **Lo personal de la tarjeta lo deposita cada socio** en Mercado Pago antes del vencimiento | Taiel compra en ML con la tarjeta del negocio. Se resta el resumen entero; cuando un socio deposita, sube el saldo |
| **El resumen de la tarjeta se carga a mano**: cierre, vencimiento, total y lo personal de cada socio | No hay API de la tarjeta |
| **Shay: botón "Marcar pagado"** en su página, con monto y fecha | Se resta lo de los meses sin pagar. Octubre se marcó pagado ($666.980, transferencia del 17/11) |
| **No se suma lo que falta liberar** | Hasta que se libera no se puede sacar |
| **Lo de Shay va entero**, aunque una parte no se haya liberado | Más simple y del lado seguro; se corrige solo cuando se libera |
| **Las cuotas no se restan aparte** | Van en el resumen de la tarjeta |

## Lo que no hace

- No ve la plata en Reservas de Mercado Pago.
- Las facturas de ML del mes anterior se cuentan hasta el día 12 (las cobra a principio de mes; en
  noviembre fueron el 4 y el 12), no por el pago real.
- No sabe a quién fue cada transferencia: el reporte no lo dice.
