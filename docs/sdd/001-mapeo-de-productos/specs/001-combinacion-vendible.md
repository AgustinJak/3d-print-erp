---
id: 001-combinacion-vendible
feature: 001-mapeo-de-productos
titulo: Lo que se vende existe como una combinación con SKU propio
estado: validated
actualizado: 2026-10-18
---

# Combinación vendible

## Contexto
"Tanjiro Katana · 95 cm · con funda" es lo que se vende, se cobra y se despacha, pero hoy no
existe como cosa: cada línea de pedido lo reconstruye con `modeloId` + un JSON de variantes. Sin
una identidad fija, cada canal la arma por texto y a su manera (ver el cerebro, `Mapeo de
productos`). Esta spec crea esa identidad.

## Requisitos
- **REQ-1** — El inventario debe guardar cada combinación vendible: un modelo más las variantes
  que la definen (cero o más).
- **REQ-2** — Cada combinación debe tener un SKU propio, único por tenant.
- **REQ-3** — Cada combinación debe tener un nombre legible armado con el modelo y sus variantes.
- **REQ-4** — El inventario debe crear solo las combinaciones de cada modelo activo (ver RN-3).
- **REQ-5** — Se debe poder crear a mano una combinación que no exista (desde el modelo o desde
  el mapeo de un canal).
- **REQ-6** — Una combinación se puede desactivar, nunca borrar.

## Reglas de negocio
- **RN-1** — Identidad: `(modelo, conjunto de variantes)`. El orden de las variantes no importa:
  `Con Funda + Negro` y `Negro + Con Funda` son la misma combinación.
- **RN-2** — SKU = **SKU del modelo + un sufijo por variante**, separados por guion, en
  mayúsculas. La combinación sin variantes lleva el SKU del modelo tal cual. Ejemplos con datos
  reales del catálogo:

  | Combinación | SKU |
  |---|---|
  | Tanjiro Katana vieja 95cm · Con Funda | `SS-DEM-KAT-006-95-CF` |
  | Tanjiro Katana vieja 95cm · Sin Funda | `SS-DEM-KAT-006-95-SF` |
  | Porta auricular NUBE · Rosa | `SS-POR-MUE-079-ROS` |
  | Bola de JOJOS · Verde Comun | `SS-JOJ-022-VER` |
  | Bola de JOJOS · Verde (Metalizado) | `SS-JOJ-022-VERD` (choca con el anterior: suma una letra) |
  | Tanjiro MiniKatana (sin variantes) | `SS-DEM-MIN-016` |

  Sufijos: `Con Funda` → `CF`, `Sin Funda` → `SF`; el resto, las tres primeras letras sin acentos
  ni símbolos (`abreviar()` de `src/lib/sku.ts`). Si dos variantes del mismo modelo dan el mismo
  sufijo, la segunda suma la siguiente letra hasta que difieran (`Verde Comun` → `VER`,
  `Verde (Metalizado)` → `VERD`, que es el caso real de la Bola de JOJOS). El sufijo propuesto se puede editar antes de guardar.
- **RN-3** — Siembra: por cada modelo activo, una combinación por cada variante activa; si el
  modelo no tiene variantes, una sola, sin variantes. Al 2026-10-18 da unas 137. Las
  combinaciones de más de una variante (no hay ningún modelo así hoy) se crean a mano o desde el
  mapeo cuando aparecen.
- **RN-4** — El SKU **se asigna una vez y no cambia** aunque se renombre el modelo o la variante
  (regla de la `Convención de SKU`). Un modelo sin SKU deja a sus combinaciones sin SKU hasta que
  lo tenga; no se inventa uno.
- **RN-5** — Un SKU nunca se reutiliza: una combinación desactivada conserva el suyo.
- **RN-6** — Las combinaciones son por tenant, como todo lo demás.

## Criterios de aceptación
- [ ] **CA-1** — Dado el catálogo del 2026-10-18, cuando corre la siembra, entonces cada modelo
  activo queda con sus combinaciones según RN-3 y ninguna se repite.
- [ ] **CA-2** — Dada la "Tanjiro Katana vieja 95cm" con "Con Funda", entonces su combinación
  tiene SKU `SS-DEM-KAT-006-95-CF` y nombre "Tanjiro Katana vieja 95cm · Con Funda".
- [ ] **CA-3** — Correr la siembra dos veces no crea nada nuevo ni cambia ningún SKU.
- [ ] **CA-4** — Dado un modelo sin SKU (al 2026-10-18, 11 activos; entre ellos las dos
  "Tanjiro Katana nueva"), entonces sus combinaciones quedan sin SKU y aparecen en la lista de
  "faltan datos".
- [ ] **CA-5** — Intentar crear una combinación que ya existe (mismo modelo y variantes, en otro
  orden) devuelve la existente.

## Casos borde
- Modelo consolidado en otro: no se siembra; sus ventas históricas se resuelven contra el modelo
  que lo absorbió solo si la combinación existe ahí (ver spec 003, backfill).
- Variante inactiva: no se siembra; si aparece en una venta vieja, la combinación se crea
  desactivada para el backfill.
- Renombrar un modelo: el nombre de la combinación se recalcula; el SKU no.

## Fuera de alcance
- Ejes en las variantes (`tamaño`, `funda`) y el producto cartesiano automático: hoy ningún
  modelo combina dos ejes.
- Costo propio por combinación (sigue base + adicional): va en otra feature.
- Cambiar el formato de los SKUs existentes.

## Preguntas abiertas
Ninguna.

## Referencias
- `src/lib/sku.ts:20` (`abreviar`), `:51` (`sugerirSku`)
- `prisma/schema.prisma` (`Modelo`, `VarianteModelo`)
- Cerebro: `Mapeo de productos`, `Convención de SKU`
