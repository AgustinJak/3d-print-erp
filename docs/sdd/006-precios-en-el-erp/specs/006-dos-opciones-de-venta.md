---
id: 006-dos-opciones-de-venta
feature: 006-precios-en-el-erp
titulo: Todo producto se vende en ML con dos opciones que dejan la misma plata
estado: draft
actualizado: 2026-10-29
---

# Dos opciones de venta

## Contexto

Pedido de Agustín, 2026-10-29: todos los productos con dos opciones de venta en ML. La segunda
ofrece envío gratis y 3 cuotas sin interés, y cuesta más para que la venta deje el mismo dinero que
la primera. Hoy lo hace a mano (el Soporte de Auricular Angel: Clásica $29.434, Premium $45.490) y,
en un producto con variantes, variante por variante (el vaso BTS tiene 7).

## Las dos opciones

| | Precio (lo que paga el cliente) menor a $30.000 | Desde $30.000 |
|---|---|---|
| **Opción 1** | sin cuotas, envío a cargo del comprador | sin cuotas, envío gratis (ML lo obliga) |
| **Opción 2** | 3 cuotas sin interés, envío gratis | 3 cuotas sin interés, envío gratis |

## Requisitos

- **REQ-1** Precios muestra, por producto, el precio de la opción 1 y el de la opción 2, y para
  cada publicación existente a cuál de las dos corresponde.
- **REQ-2** Si a un producto le falta una opción, lo dice ("falta la opción 2") y da el precio a
  publicar.
- **REQ-3** Si la API de ML lo permite (TASK-013 lo verifica antes de construir nada), el ERP crea
  la opción que falta, para todas las variantes de un producto de una vez, con vista previa y
  confirmación. Si no lo permite, la pantalla da los precios para cargarla a mano con "Agregar
  opción de venta".

## Reglas de negocio

- **RN-1** La opción 1 sale de la ganancia del producto (margen objetivo) con sus costos reales:
  comisión de la categoría, cargo fijo del tramo y, desde $30.000, el envío.
- **RN-2** La opción 2 deja **la misma plata que la opción 1 ya redondeada**: se calcula la ganancia
  real de la opción 1 a su precio final y la opción 2 se sube hasta dejar eso, sumando el recargo
  por 3 cuotas y el costo del envío gratis.
- **RN-3** El corte de $30.000 se mira sobre lo que paga el cliente en la opción 1. Si la opción 1
  queda abajo y la opción 2 arriba, la opción 2 igual lleva envío gratis: no cambia nada.
- **RN-4** El costo del envío gratis es el real de la publicación (`shipping_options/free`). Para un
  producto sin publicar, el que cotice ML con su peso y medidas si están cargados; si no, el de la
  configuración, marcado como estimado.
- **RN-5** El recargo por 3 cuotas es el cobrado en ventas reales (spec 003, RN-4). Agustín dice
  8,9 %.
- **RN-6** Crear una publicación en ML es público y no se deshace solo: cada tanda se confirma
  aparte, y la primera es un solo producto que elige Agustín.

## Criterios de aceptación

- **CA-1** Angel: opción 1 a unos $29.000 y opción 2 a unos $45.000, dejando la misma ganancia
  (±$200 por redondeo).
- **CA-2** Un producto de más de $30.000: las dos con envío gratis, y la diferencia entre ellas es
  sólo lo que cuestan las cuotas.

## Fuera de alcance

- Más opciones que estas dos (6 cuotas, Flex con precio propio).
