---
id: 002-politica-de-precio-por-modelo
feature: 003-precios-desde-bodega
titulo: En Bodega se decide el margen y el redondeo de cada modelo, y se guardan sus tres precios
estado: validated
actualizado: 2026-10-20
---

# Política de precio por modelo

## Contexto
La calculadora de Bodega ya calcula los tres precios (Mercado Libre, tienda web y
personalizados) con lo que cuesta vender en cada canal (`src/renderer/src/lib/precios.ts`).
Pero el margen es uno solo para todo (`precio_margenMinorista`), el redondeo no se guarda, y el
resultado no queda en ningún lado: se copia a mano a cada canal. La ficha del modelo todavía
muestra el precio viejo de ML (costo × 1,8, `ModeloDetalle.tsx:344`).

## Requisitos
- **REQ-1** — Cada modelo de Bodega debe poder tener su propio margen, su propio redondeo y su
  promo de ML (el % que se infla el precio publicado, `PROMOS` en la calculadora); vacío = los
  globales.
- **REQ-2** — La calculadora debe tener "Guardar precios en el modelo": guarda margen, redondeo,
  promo, material y la receta, y una **foto** de los tres precios con la fecha.
- **REQ-3** — Los gastos de venta (comisiones, publicidad, cuotas, envío, IIBB, márgenes globales)
  deben subir al ERP, igual que hoy suben los parámetros de costo.
- **REQ-4** — El margen, el redondeo y la foto de cada modelo deben subir al ERP con el modelo.
- **REQ-5** — La ficha del modelo en Bodega debe mostrar los tres precios con la fórmula nueva y la
  política del modelo, en lugar del × 1,8.

## Reglas de negocio
- **RN-1** — La foto es lo que Agustín vio y aprobó en Bodega ese día. El ERP no la publica tal
  cual: recalcula con los costos de hoy (spec 003) y la muestra al lado, para que se vea si algo
  cambió desde entonces.
- **RN-2** — Margen y redondeo son una decisión, no un dato medido: se guardan sólo con el botón,
  nunca solos al abrir la calculadora.
- **RN-3** — Redondeos posibles: los de hoy (`exacto`, `cien`, `quinientos`, `mil`, `noventa`).
  Global por defecto: `noventa`, que es el que arranca seleccionado hoy.
- **RN-4** — Los gastos de venta suben sólo cuando cambian (la misma huella que los parámetros de
  costo, `sync.ts:186`).

## Criterios de aceptación
- [ ] **CA-1** — Dado un modelo al que se le guardó margen 45 % y redondeo `mil`, cuando se abre de
  nuevo en la calculadora, arranca con 45 % y `mil`, y el resto de los modelos sigue con el global.
- [ ] **CA-2** — Cuando se guardan los precios de un modelo, entonces en el ERP aparecen su margen,
  su redondeo y la foto con la fecha, después de la próxima sincronización.
- [ ] **CA-3** — Cuando se cambia la comisión de ML en Bodega y se guarda la configuración, entonces
  el ERP la usa en la próxima pasada.
- [ ] **CA-4** — La ficha de un modelo muestra los mismos tres precios que la calculadora para ese
  modelo, con su material, su margen y su redondeo.

## Casos borde
- Un modelo que nunca se costeó (sin gramos ni tiempo): no tiene precio; el ERP lo marca como
  "falta costear".
- Dos PCs con Bodega: gana la última escritura del modelo, como hoy con el costeo.

## Fuera de alcance
- Que Bodega empuje precios a los canales: eso lo hace el ERP, con aprobación (spec 004).
- Precios por cantidad distintos de los tramos de hoy (`TRAMOS_MAYORISTA`).

## Preguntas abiertas
Ninguna.

## Referencias
- `Bodega/Bodega3D-App/src/renderer/src/pages/Calculadora.tsx:42` (márgenes), `:56` (redondeo),
  `:133` (`saveCostToModel`).
- `Bodega/Bodega3D-App/src/renderer/src/lib/precios.ts:43` (`GastosVenta`), `:779` (`preciosPorCanal`).
- `Bodega/Bodega3D-App/src/main/db.ts:59` (tabla `models`).
