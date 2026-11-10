---
id: 008
feature: productos-en-cantidad
estado: in-review
creado: 2026-11-10
---

# 008: Productos, para trabajar en cantidad

## Qué pasaba

La lista de Productos dejaba tildar productos enteros. Un producto con variantes (el Porta auricular
NUBE tiene cinco colores, cada uno con su publicación de ML y su stock) no se podía tratar por
partes: pasar a Flex el violeta, que tiene stock, y dejar a pedido el blanco. Tildar todo y cambiar
de filtro borraba lo tildado, no había forma de sumar un grupo entero, sólo se ordenaba por fecha o
por nombre, y la barra de filtros eran tres renglones de botones.

## Qué se quiere

Agustín, el 2026-11-10: elegir por variante, elegir por filtros, agrupar y sumar un grupo entero a
lo elegido, más órdenes ("más vendidos y cosas así"), y que sea más legible.

- **REQ-1** Un producto con variantes se abre y muestra cada una con su stock, lo que vendió y sus
  publicaciones de ML con la entrega (Flex, a pedido N días). Se tilda cada variante.
- **REQ-2** Lo elegido se acumula: cambiar un filtro, buscar o agrupar no lo borra.
- **REQ-3** Elegir de una todo lo que pasa los filtros, y sumar o quitar un grupo entero.
- **REQ-4** Filtros que miran cada variante: Mercado Libre, entrega, stock y web.
- **REQ-5** Agrupar por serie o por categoría.
- **REQ-6** Ordenar por ventas (30 días y siempre), stock y costo, además de fecha y nombre.
- **REQ-7** Con lo elegido: Flex, a pedido, crear en ML, activar y desactivar, como hasta ahora.

## Reglas

- **RN-1** Lo que se elige es la variante (la combinación que se vende). Un producto sin variantes
  activas se elige entero.
- **RN-2** Con un filtro de variante puesto, de cada producto se ven y se eligen sólo las variantes
  que lo pasan, y el producto dice "2 de 5 variantes".
- **RN-3** Flex y a pedido se mandan a las publicaciones activas y pausadas de las variantes
  elegidas. Cada publicación es de una sola variante (verificado: 223 publicaciones, ninguna
  compartida), así que elegir un color no toca otro.
- **RN-4** Activar y desactivar son del producto entero. Si de un producto hay sólo algunas variantes
  elegidas, el diálogo lo avisa.
- **RN-5** El stock es el del ERP. Dos variantes que comparten la pieza (Con Funda y Sin Funda)
  muestran el mismo stock, y en el total del producto se cuenta una vez.
- **RN-6** Lo vendido son unidades de pedidos no cancelados. El total del producto incluye las
  variantes que hoy están inactivas.
- **RN-7** El estado y la entrega de ML son los de la última lectura de precios, y la pantalla dice
  de cuándo es. Cambiar la entrega desde acá actualiza esa lectura.
- **RN-8** Nada automático: todo lo que va a ML sigue pasando por su diálogo de confirmación.
- **RN-9** Las series se agrupan sin distinguir mayúsculas ni acentos. Las que están escritas
  distinto de verdad ("JOJO" y "Jojos", "K4os" y "Kpop K4os") siguen siendo dos grupos: se
  corrigen en el producto.

## Fuera de alcance

- Unificar los nombres de las series.
- Cambiar la entrega según el stock sin intervención (descartado por Agustín el 2026-11-02).
