---
id: 002-datos-precio-y-fotos
feature: 004-estructura-del-catalogo
titulo: Los datos, el precio, el costo y las fotos se editan en el lugar, por sección
estado: validated
actualizado: 2026-10-24
---

# Datos, precio y fotos

## Contexto
El lápiz guarda todo junto, variantes incluidas, y reescribe las variantes con lo que tiene el
formulario. El formulario no trae el costo de insumos de cada variante, así que **cada guardado lo
pone en 0** (`modelos/page.tsx:372` y `:462` no copian `costoInsumosAdicional`; `parsePrice` de
`undefined` es 0). Hoy hay variantes "Con Funda" con $200 o $400 de insumos que se pierden así.

## Requisitos
- **REQ-1** — La página debe tener una sección **Datos**: nombre, SKU (con "Generar"), serie,
  categorías, peso y notas.
- **REQ-2** — La página debe tener una sección **Precio y costo**: precio de venta, recargo por
  crédito, mayorista, promo, costo de fabricación y costo de insumos.
- **REQ-3** — La página debe tener una sección **Fotos y archivo**: hasta 5 imágenes (la primera es
  la principal) y el `.3mf`.
- **REQ-4** — Cada sección debe guardarse sola, con su botón "Guardar", y mandar sólo sus campos.
- **REQ-5** — Guardar una sección no debe tocar las variantes.
- **REQ-6** — El margen debe calcularse con el costo completo: fabricación + insumos.
- **REQ-7** — El costo de un producto con piezas se muestra "de Bodega", sin campo editable, con la
  pieza de donde sale (spec 007). Sólo un producto sin pieza (algo que no se imprime) tiene el
  costo editable.

## Reglas de negocio
- **RN-1** — Margen = (precio de venta − costo de fabricación − costo de insumos) / precio de
  venta.
- **RN-2** — Los importes se escriben como hoy: "7.500" son siete mil quinientos (`parsePrice`).
- **RN-3** — "Generar" usa la serie y la primera categoría, como hoy (`/api/modelos/skus`); si
  falta alguna, lo dice.
- **RN-4** — Una foto subida se guarda al terminar de subir: no espera al botón.

## Criterios de aceptación
- [ ] **CA-1** — Dado un modelo con una variante "Con Funda" de $400 de insumos, cuando se cambia y
  se guarda el precio de venta, entonces la variante sigue con $400.
- [ ] **CA-2** — Dado un precio de $23.000, fabricación $7.081 e insumos $5.349, entonces el
  margen es 46 %.
- [ ] **CA-3** — Dado un SKU repetido, cuando se guarda Datos, entonces la página avisa que ese SKU
  ya lo tiene otro modelo (y cuál) y no guarda.
- [ ] **CA-4** — Dado un producto enganchado a la pieza "Tanjiro Katana nueva 95cm", entonces la
  sección de costo muestra esa pieza y su costo de Bodega, sin campo para editarlo.

## Casos borde
- Salir con cambios sin guardar en una sección: la página avisa.
- Un modelo sin serie o sin categoría: "Generar" no inventa, pide el dato.

## Fuera de alcance
- Que el precio venga de Bodega: es el SDD 003 (pantalla de Precios).

## Preguntas abiertas
Ninguna.

## Referencias
- `src/app/(app)/modelos/page.tsx:1017` a `:1367` (los campos del diálogo).
- `src/app/api/modelos/[id]/route.ts:65` (PUT reescribe las variantes por nombre).
- `src/lib/utils.ts:20` (`parsePrice`).
- `src/lib/costos-bodega.ts` (`costosPorFilaDeStock`).
