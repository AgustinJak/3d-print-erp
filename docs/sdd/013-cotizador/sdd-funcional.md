---
id: 013
feature: cotizador
estado: validated
creado: 2026-11-16
---

# 013: Cotizador rápido

## Qué se quiere

Agustín, el 2026-11-16: "una calculadora de producto fácil en el ERP o en la Bodega para cotizar
productos de forma rápida, productos que capaz no se van a imprimir; es sólo para cotizar rápido".

## Cómo

En el ERP, en Catálogo → **Cotizador** (`/cotizador`), porque ahí está el motor de precios. Se
cargan gramos, tiempo, material, insumos por unidad, margen (vacío: el de Precios) y unidades. Al
instante:

- **Costo de fabricación** con la fórmula de Bodega (material, luz, desgaste y fallas), con sus
  parámetros y el precio por kilo del material elegido.
- **Precio de Mercado Libre, web y venta directa** con el motor del ERP: margen sobre el precio,
  gastos generales de ML (comisión, cargo fijo, cuotas, publicidad, envío, IIBB), redondeo y, en ML,
  lo que se publica inflado por la promo. Cuánto deja y el margen de cada uno.
- **Copiar los precios** para mandárselos al cliente.

## Reglas

- **RN-1.** No guarda nada ni crea productos.
- **RN-2.** La fórmula de costo es la misma que usa el ERP con las recetas de Bodega
  (`lib/costos-formula.ts`); el precio, la misma que Precios (`precios-formula`).
- **RN-3.** ML usa los gastos generales: una publicación real puede variar un poco según su
  categoría. La pantalla lo dice.
- **RN-4.** Si el margen de un canal queda abajo del objetivo, se explica: o se quedó justo abajo
  del envío gratis, o lo cruzó y suma el envío sin pedirle más ganancia (mismos pesos, menos %).

## Probado

12 pruebas puras (`scripts/sdd-013-probar-cotizador.ts`). Con la configuración real (2026-11-16:
35 %, promo 10 %, redondeo a 90): 150 g y 6 h cuesta $3.648 y sale $12.090 en ML (publicar
$13.434), $7.190 en la web y $5.690 en venta directa.
