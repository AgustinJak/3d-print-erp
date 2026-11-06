# Bitácora 007

## 2026-11-04 · Claude (sesión del inventario)

**Pedido.** Agustín: restar percepciones y publicidad de la ganancia bruta, descontarle a Shay todo
lo suyo, simplificar Finanzas, y "todos los números reales que da la plataforma, nada de suponer".

**Lo que cambió el plan.**

- La primera cuenta (gasto del panel × 1,21) estaba mal: ML anula parte de los cargos, y la
  Publicidad de Seguidores no sale en el panel. La pantalla de Agustín lo mostró.
- ML no dice de qué campaña es cada cargo, pero cada uno es el gasto de una campaña × 1,21. Coincide
  al centavo, así que a Shay no hace falta prorratearle la publicidad.
- Lo cargado a mano como percepciones es la aproximación de la pantalla de ML, del período que
  cierra el mes siguiente. Ese es el mapeo mes-período de RN-3.

- Al mirar Flex apareció lo grande: el cobrado no coincidía con MP. Una venta de $26.991 contaba
  $26.991 y recibió $17.293,93. La comparación tuvo un error mío: restaba el envío también cuando MP
  ya lo había descontado. Corregido antes de dar la cifra.
- Agustín confirmó: cobrado real de MP, Flex real a la bruta, pagos de logística desde la empresarial.
  Copia de los precios antes de corregir: `copia-pedidos-ml-2026-11-04.json`, en el scratchpad de la
  sesión.
- A la logística se le paga por transferencia de MP a Mariano Tevez (2026-11-03, $183.700). Esa
  transferencia no está en `/v1/payments/search`, buscada de marzo a noviembre: no se pueden traer
  solas. Se cargan a mano.
- Los gastos compartidos de octubre estaban en 0 desde el 4/11 a las 7:12, sin causa identificada y
  sin que Agustín recuerde haberlos borrado. Se restauraron el 2026-11-06 con los valores anteriores.
