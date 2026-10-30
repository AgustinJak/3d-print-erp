---
id: 004-productos-sin-publicar
feature: 006-precios-en-el-erp
titulo: A cuánto publicar un producto nuevo en cada opción de ML
estado: draft
actualizado: 2026-10-29
---

# Productos sin publicar

## Contexto

La comisión depende de la categoría de ML, y un producto nuevo todavía no tiene publicación. El
2026-10-28 la cuenta publicaba en 23 categorías, con comisiones de 13,5 % a 16 % para la Clásica.

## Requisitos

- **REQ-1** Cada producto tiene una "categoría de ML":
  1. la de su publicación, si tiene;
  2. si no, la más usada entre los productos de su misma categoría del ERP que ya están
     publicados;
  3. si no, la que devuelve el predictor de ML (`/sites/MLA/domain_discovery/search`) con el
     nombre del producto;
  4. siempre editable a mano.
- **REQ-2** Con la categoría, Precios muestra a cuánto publicar cada opción: Clásica, Premium con
  cuotas y con envío gratis.

## Reglas de negocio

- **RN-1** Lo heredado gana al predictor: el predictor manda "Katana Zenitsu 95cm" a "Katanas"
  (16 %) y Sendero publica sus 54 espadas en "Espadas" (14 %).
- **RN-2** Sin ningún dato, la comisión más alta entre las categorías donde publica la cuenta,
  marcada como estimada.

## Criterios de aceptación

- **CA-1** Una katana nueva sin publicar toma la categoría "Espadas" de las otras katanas.
