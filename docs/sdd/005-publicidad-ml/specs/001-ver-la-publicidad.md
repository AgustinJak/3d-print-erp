---
id: 001-ver-la-publicidad
feature: 005-publicidad-ml
titulo: Ver qué deja cada campaña de Product Ads, con el margen real de cada producto
estado: validated
actualizado: 2026-10-26
---

# Ver la publicidad

## Contexto

Las campañas de Product Ads se miran hoy en el panel de ML, que dice cuánto se gastó y cuánto se
vendió, pero no si quedó plata: ML no sabe cuánto cuesta hacer cada pieza. El ERP sí lo sabe
(Bodega + recetas, SDD 003) y sabe lo que cobra ML por vender (gastos de venta de la calculadora).

## Requisitos

- **REQ-1** Una página **Publicidad** con un período elegible (7 días, 30 días, este mes, el mes
  pasado; nunca más de 90 días atrás, el límite de ML).
- **REQ-2** Arriba, cuatro números del período: gasto, ventas atribuidas, ROAS y **ganancia
  después de publicidad** (estimada).
- **REQ-3** Una fila por campaña: estado, de quién es (Sendero o Shay), presupuesto diario,
  ROAS objetivo, ROAS real, **ROAS mínimo** (el de equilibrio), gasto, ventas y ganancia
  estimada. Cuánto se perdió de impresiones por presupuesto, si ML lo informa.
- **REQ-4** Al abrir una campaña, sus anuncios con las mismas métricas y el costo usado.
- **REQ-5** Alertas en lenguaje simple: "gastó sin vender", "ROAS debajo del mínimo: pierde
  plata", "limitada por presupuesto".

## Reglas de negocio

- **RN-1** Ganancia por venta antes de publicidad = precio − costo × unidades − comisión, cuotas,
  otros cargos e IIBB (% del precio) − cargo fijo − envío si el precio pasa el umbral. Los
  porcentajes son los gastos de venta de Bodega (`leerGastosDeVenta`), sin la línea de publicidad.
- **RN-2** ROAS mínimo = precio / ganancia antes de publicidad. Debajo de ese número, cada venta
  por publicidad pierde plata.
- **RN-3** Ganancia después de publicidad (estimada) = ventas atribuidas × (ganancia / precio) −
  gasto. Las ventas indirectas se cuentan con el margen del anuncio: es una aproximación y la
  pantalla lo dice.
- **RN-4** El costo sale de Bodega por la clave de ML de la publicación. Si no tiene, del costo
  guardado en las ventas de esa publicación de los últimos 90 días. Si no hay ninguno, el anuncio
  dice "sin costo" y no entra en la ganancia.
- **RN-5** Una campaña es de Shay si está en la selección de Finanzas (`campanasShay`). Sus
  anuncios no tienen costo en el ERP: se muestran sus métricas y no se estima ganancia.

## Criterios de aceptación

- **CA-1** Con la cuenta real, la suma del gasto de las campañas coincide con el panel de ML para
  el mismo período (±1 %).
- **CA-2** Un anuncio con costo de Bodega muestra su ROAS mínimo y su ganancia estimada.
- **CA-3** Si ML no responde o falta el permiso, la página lo dice sin romperse.

## Casos borde

- Un anuncio cuya publicación tiene variaciones con costos distintos: se usa el promedio.
- Una publicación de pack: el costo va por las unidades de la clave.
- Período sin gasto: la página lo muestra vacío, no en cero con alertas.

## Fuera de alcance

- Brand Ads y Display. Crear campañas nuevas (va a la spec 002 si se pide).

## Referencias

- Doc de ML: "Product Ads para Catálogo y User Products" (lectura, Argentina) y la misma página en
  Global Selling (escritura).
