# SDD 019 · Técnico

## Datos (`prisma/sql/retirable.sql`, aplicado el 2026-11-27)

| Tabla | Qué |
|---|---|
| `saldos_mp` | Una fila por lectura: `saldo`, `al` (hora del último movimiento del reporte), `leido_en`, `reporte` (nombre del archivo) |
| `resumenes_tarjeta` | `cierre` (único por tenant), `vencimiento`, `total`, `partes` jsonb `[{socio, monto, depositado}]`, `pagado` |
| `ventas_terceros` | + `pagado_monto`, `pagado_en`: lo que se le pagó a Shay de ese mes |

## Código

- `src/lib/retirable.ts`
  - `leerSaldoMp`: `POST /v1/account/release_report` de los últimos 3 días con el token de la cuenta
    principal de ML, espera en `/list` el más nuevo creado después del pedido (la lista usa **otro
    id** que el del pedido y redondea las fechas al día), baja el CSV y guarda el último
    `BALANCE_AMOUNT` con fecha. La última línea del CSV es el total, sin fecha.
  - `actualizarShaySinPagar`: recalcula el cierre de Shay (`calcularCierreTercero`) de los meses sin
    pagar que no lo tienen y del mes en curso.
  - `calcularRetirable`: la cuenta, sin llamar a ML ni a Mercado Pago. Las facturas de ML son
    `publicidad + percepciones + otros` de `cargosPorMes` (con la parte de Shay: la paga la cuenta y
    se le descuenta a ella en `aPasar`).
- `GET /api/finanzas/retirable` (la cuenta) y `POST` (lee el saldo y recalcula Shay, `maxDuration` 300).
- `/api/finanzas/tarjeta`: `GET` los últimos 6, `POST` crea o reemplaza por cierre, `PATCH` `pagado`
  o `partes`, `DELETE ?id=`.
- `PATCH /api/finanzas/terceros` con `pagado: {monto, fecha} | null` (`marcarPagado` en
  `lib/ventas-terceros.ts`); el cierre trae `pagado`.
- Pantallas: `app/(app)/finanzas/retirar.tsx` (arriba de las billeteras) y "Marcar pagado" en
  `app/(app)/shay/shay-card.tsx`.

Se borró `cuantoSePuedeRetirar` de `lib/billeteras.ts` (la versión que partía de la billetera).

## Prueba (2026-11-27, contra la cuenta real)

- El parser del CSV con un reporte chico.
- `leerSaldoMp`: $582.724,31 en 16 s, lo mismo que muestra Mercado Pago.
- `calcularRetirable`: $582.724 − Shay de noviembre $277.156 − facturas de ML de noviembre $350.392
  = **−$44.824**, sin el resumen de la tarjeta cargado (con los $535.018 hasta hoy: −$579.842).
- La primera prueba falló buscando el reporte por el id del pedido: así se encontró lo del id.
