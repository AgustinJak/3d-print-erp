---
id: 007
feature: ganancia-neta-real
estado: in-review
creado: 2026-11-04
---

# 007: técnico

## Lo medido en la cuenta (2026-11-04, sólo lectura)

| Hecho | Cómo se comprobó |
|---|---|
| El período va del 9 al 8; la clave `2026-10-01` es del 9/9 al 8/10 | Fechas de los cargos, y la pantalla de ML: "Cierre 08/nov" |
| Cada `PADS` es el gasto de una campaña el día anterior × 1,21 | Línea por línea el 1 y el 2/11, al centavo |
| Cada `BPAD` trae el cargo que anula en `charge_bonified_id` | Los montos coinciden con el cargo de "Cyber Monday" |
| Las anulaciones de la pantalla son todos los `B*` | −$216.935,97, exacto |
| Las percepciones aparecen al cerrar; `total_perception` da 0 en el período abierto | Resumen de `2026-11-01` contra la pantalla ($211.097) |
| `INSTALLMENTS_CAMPAIGN` es de sólo lectura | `/categories/{id}/sale_terms` y `/items/validate` |

`monthly/periods` trae fechas raras en algunas claves (`2026-10-01`: hasta el 30/10, vence el 1/10).
No se usan: se toman la clave y la fecha de cada cargo.

## Datos

`prisma/sql/facturacion-ml.sql`:

- `cargos_ml`: una fila por cargo o bonificación, con `clase` (`publicidad`, `percepcion`, `otro`),
  `dia_gasto`, `bonifica_id` y la campaña si se pudo atribuir.
- `periodos_ml`: qué se leyó de cada período y grupo (ML, MP). `completo` = cerrado y con todas sus
  líneas: no se vuelve a pedir.

## Código

| Archivo | Qué hace |
|---|---|
| `src/lib/facturacion-ml.ts` | Lee la API, atribuye campañas y lleva lo de Shay a su cierre |
| `src/lib/resultado-mes.ts` | Arma los cargos de cada mes. Una sola cuenta para Finanzas y el panel |
| `POST /api/finanzas/facturacion-ml` | El botón "Actualizar de ML" |
| `GET /api/cron/facturacion-ml` | Una vez por día, 10:00 UTC |
| `app/(app)/finanzas/resultado-del-mes.tsx` | De lo cobrado a la neta |

## Riesgos

- **La API deja 5 pedidos por minuto**, y a la función le quedan 60 segundos. Cada pedido espera 13
  segundos y corta a los 45. Un 429 se espera y se reintenta. Lo que no entró sigue en la pasada
  siguiente, y como el offset arranca en lo ya guardado, no se repite.
- **Las métricas de publicidad llegan a 90 días**, así que un cargo más viejo no se puede atribuir.
  Es real y queda en la publicidad total, sin campaña.
- **El 1,21 sale de lo medido**, no de una regla publicada por ML. Si cambia, los cargos dejan de
  coincidir y se ve en "no coinciden con ninguna campaña"; no se atribuye mal.
- **Un período abierto con las percepciones a mano** es una aproximación, y la pantalla lo dice.
