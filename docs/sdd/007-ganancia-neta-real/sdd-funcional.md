---
id: 007
feature: ganancia-neta-real
estado: in-review
creado: 2026-11-04
---

# 007: La ganancia neta con lo que factura Mercado Libre

## Qué pasaba

La "ganancia neta" de Finanzas y el panel restaba sólo los gastos cargados a mano. La publicidad y
las percepciones de ML no estaban en ningún lado, y son la parte grande: en octubre, cientos de
miles de pesos. Además, Finanzas era una pared de tarjetas: unas treinta cifras a la vez, sin un
recorrido claro.

## Qué se quiere

Agustín, el 2026-11-04: **"quiero todos los números reales que da la plataforma, nada de suponer
cosas"**.

- **REQ-1** La ganancia neta resta publicidad y percepciones, con los números de la facturación de
  ML, además de los otros cargos que no están en cada venta y los gastos empresariales.
- **REQ-2** A Shay se le descuenta todo lo que le pertenece: sus campañas con el cargo real, y su
  parte de las percepciones.
- **REQ-3** Finanzas se lee de arriba abajo, de lo cobrado a la ganancia neta. El resto, a un toque.
- **REQ-4** Si un dato todavía no existe, se dice. No se estima para completar.

## Reglas

- **RN-1** La publicidad se cuenta por el día del gasto, para poder sumar un mes calendario. ML
  factura del 9 al 8, pero cada cargo trae su fecha.
- **RN-2** La publicidad es lo facturado: con IVA y sin lo que ML anula. Incluye la Publicidad de
  Seguidores, que no sale en las métricas de Product Ads.
- **RN-3** Las percepciones no vienen por día: ML las da enteras al cerrar el período. El mes M
  lleva las del período que cierra el 8 de M+1, igual que la pantalla de ML.
- **RN-4** Mientras un período no cerró no hay número oficial, y la API no da la aproximación de la
  pantalla. Se usa lo cargado a mano en /shay, marcado "Aproximado"; sin eso, "Sin informar" y la
  ganancia no las descuenta.
- **RN-5** Un cargo de Product Ads se atribuye a una campaña sólo si coincide al centavo con su
  gasto de ese día × 1,21. Si no coincide ninguna, queda sin campaña: no se adivina.
- **RN-6** Una anulación es de la campaña del cargo que anula, y ML dice cuál.
- **RN-7** La comisión y el envío de cada venta no se traen: ya están en el neto de cada línea de
  pedido, y traerlos los contaría dos veces.
- **RN-8** Al cerrar un período, las percepciones de /shay se reemplazan por las de ML, y su
  publicidad por lo facturado de sus campañas. Los meses que las métricas no cubren desde el primer
  día (90 días atrás) no se pisan.
- **RN-9** Los cargos entran a la billetera empresarial desde el primer mes con ventas en el ERP.
  Antes habría cargos sin sus ingresos.

## Fuera de alcance

- Conciliar el neto de cada venta del ERP contra los cargos por venta de ML.
- El prorrateo de Mi página y las devoluciones con Shay: hoy los paga Sendero.
