---
id: 002-politica-por-producto
feature: 006-precios-en-el-erp
titulo: Margen, promo y redondeo propios de un producto, en su página del ERP
estado: draft
actualizado: 2026-10-29
---

# Política por producto

## Contexto

Hoy la política propia es de la pieza de Bodega (`bodega.models`: margen, redondeo, promo_ml) y se
aplica a toda combinación que se vende con esa pieza. El 2026-10-28 la tenían 16 piezas.

## Requisitos

- **REQ-1** En la página del producto: margen, promo de ML y redondeo propios, cada uno "usar el
  general" o un valor, con el precio resultante al lado.
- **REQ-2** Migración única de las 16 piezas con política propia al producto del ERP que las usa.

## Reglas de negocio

- **RN-1** Si una pieza la usan productos distintos, cada uno recibe la política de la pieza. Si un
  producto usa dos piezas con políticas distintas, no se elige sola: queda en una lista para que
  Agustín decida.

## Criterios de aceptación

- **CA-1** Los productos de las 16 piezas tienen después la misma política que tenían sus piezas.
