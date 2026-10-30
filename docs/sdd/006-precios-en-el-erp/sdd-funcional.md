---
feature: 006-precios-en-el-erp
epica: ninguna
estado: validated
autor: Agustín (pedido) · Claude (sesión del inventario)
actualizado: 2026-10-30
---

# SDD funcional · Precios en el ERP

## 1. Objetivo

Que el precio se decida en un solo lugar, el ERP, con los costos reales de cada canal y de cada
publicación de Mercado Libre. Bodega pasa a ser la fuente de los datos del taller (tiempo, gramos,
material, insumos, parámetros de la máquina) y deja de calcular precios.

Pedido de Agustín, 2026-10-28: "el cálculo de precio debería estar en el ERP y que la bodega solo
mande la hora que tarda el modelo, gramos e insumos". Suma las dos mejoras que aprobó el mismo
día: precio por publicación de ML (cuotas y envío gratis) y comisión real de ML en vez del
promedio.

> Validado por Agustín el 2026-10-29 ("Dale"), con dos agregados: todo producto con dos opciones de
> venta que dejen la misma plata (spec 006) y prender o apagar Flex desde el ERP (spec 007).

## 2. Por qué

- **Bodega no sabe nada de ML.** Tipo de publicación, envío gratis, comisión de la categoría y
  cargo fijo por precio sólo los tiene el ERP, que es el que habla con ML.
- **Dos copias de la fórmula** (Bodega y `precios-bodega.ts`) con un script para mantenerlas
  iguales.
- **La configuración está escondida en la calculadora del taller**: la promo general de ML quedó en
  18,9 % sin que nadie lo viera (2026-10-28), y el Soporte de Auricular Angel se publicó caro.
- **Los gastos de ML son un promedio que no se parece a la tarifa**: Bodega usa 11,3 % + $1.053
  para todo; ML cobra de 13,5 % a 16 % según la categoría y un cargo fijo de $0 a $3.320 según el
  precio (verificado el 2026-10-28 con `listing_prices`, en las 23 categorías donde publica la
  cuenta).

## 3. Qué hace cada sistema después

| | Bodega | ERP |
|---|---|---|
| Tiempo, gramos, material, insumos de cada pieza | los carga y los sube | los lee |
| Parámetros de la máquina y precio de cada material | se quedan (decisión de Agustín, 2026-10-28) | los lee |
| Costo de fabricación | lo muestra | lo calcula, como hoy |
| Gastos de venta, margen, promo, redondeo generales | dejan de estar | Precios › Configuración |
| Margen, promo y redondeo de un producto | dejan de estar | la página del producto |
| Precio de cada canal y de cada publicación de ML | dejan de estar | Precios |

## 4. Flujos

### 4.1 Configurar
Precios › Configuración → margen objetivo, promo de ML, redondeo, publicidad, IIBB, gastos de la
web → Guardar. Lo de ML que antes era un promedio (comisión, cargo fijo, cuotas) ya no se carga:
sale de ML.

### 4.2 Un producto ya publicado
Leer precios de ML → por cada publicación el ERP trae tipo, envío gratis y su costo, categoría y
comisión → Precios propone un precio por publicación, el que deja la misma ganancia que el
producto → Aplicar, como hoy.

### 4.3 Las dos opciones de venta
Cada producto tiene en ML una opción 1 (sin cuotas; envío a cargo del comprador debajo de $30.000,
gratis desde ahí) y una opción 2 (3 cuotas sin interés y envío gratis), que cuesta más para dejar la
misma plata. Precios muestra las dos, avisa si falta una y, si ML lo permite, la crea.

### 4.4 Flex
Por publicación, prender o apagar Envíos Flex desde Precios.

### 4.5 Un producto sin publicar
Página del producto → "categoría de ML" (heredada, predicha o elegida) → Precios muestra a cuánto
publicar cada opción: Clásica, Premium con cuotas y con envío gratis.

## 5. Reglas de negocio

Detalle en las specs. Las de fondo:

- **RN-1** La ganancia es del producto: la que sale del margen objetivo, como hoy. Cada canal y
  cada publicación suman arriba sus costos para dejar esa misma ganancia.
- **RN-2** La comisión, el cargo fijo y el recargo por cuotas son los de ML para esa publicación,
  no un promedio.
- **RN-3** Promo general de ML: 10 % (decisión de Agustín, 2026-10-28; estaba en 18,9 % por error).

## 6. Specs

- [001-configuracion-de-precios](specs/001-configuracion-de-precios.md)
- [002-politica-por-producto](specs/002-politica-por-producto.md)
- [003-ml-por-publicacion](specs/003-ml-por-publicacion.md)
- [004-productos-sin-publicar](specs/004-productos-sin-publicar.md)
- [005-cambios-en-bodega](specs/005-cambios-en-bodega.md)
- [006-dos-opciones-de-venta](specs/006-dos-opciones-de-venta.md) (2026-10-29)
- [007-flex-desde-el-erp](specs/007-flex-desde-el-erp.md) (2026-10-29)
- [008-crear-en-ml](specs/008-crear-en-ml.md) (2026-10-29, con un botón por producto)
- [009-mayorista-en-la-web](specs/009-mayorista-en-la-web.md) (2026-10-30)
- [010-avisos-de-promo](specs/010-avisos-de-promo.md) (2026-10-30)

## 7. Fuera de alcance

- El costo real del correo en la web.

## 8. Dependencias

- SDD 003 (Precios): esto lo reemplaza en "de dónde salen las decisiones". La pantalla, la lectura
  y la escritura en los canales siguen igual.

## 9. Decisiones tomadas

- Promo general 10 % (2026-10-28).
- **Margen sobre el precio de venta, 35 %** (2026-10-30): precio = costo total (impresión + insumos) /
  (1 − gastos variables − margen), con lo que cobra ML de verdad, por canal. Antes era 50 % con la
  comisión promedio; con 35 % y la comisión real los precios de ML quedan, en la mediana, donde
  estaban (+1 %).
- **El mismo 35 % en la web** (2026-10-30), y los tramos por cantidad de la web salen de lo que
  tiene que dejar cada uno (spec 009). Quedó: **envío gratis desde $40.000** también en los pedidos
  por cantidad, una **reserva de 3 %** en cada precio de la web para pagarlo, y **tramos 8 / 12 / 18 %**
  con pisos 18 / 17 / 14 % (2026-10-30). Las metas 30 / 25 / 20 no se pueden cumplir con un solo juego
  de tramos y el envío gratis.
- **Sin promo si la promo publica arriba de $30.000** (2026-10-30, spec 003 RN-6).
- Precio de ML fijo por producto cuando conviene no cruzar los $30.000: los porta auriculares
  (Angel, Nube, AC/DC, Demonio) en $29.434 publicado (2026-10-29).
- Parámetros de la máquina y materiales quedan en Bodega (2026-10-28).
- Dos opciones de venta para todo producto, la segunda con 3 cuotas y envío gratis, dejando la
  misma plata; desde $30.000, las dos con envío gratis (2026-10-29).
- Flex se prende y apaga desde el ERP; su precio no cambia (2026-10-29).
- Categoría de ML de un producto sin publicar: la heredada de los productos de su misma categoría
  del ERP ya publicados; si no hay, el predictor de ML; siempre editable (propuesta del
  2026-10-29, se valida con este SDD).

## 10. Preguntas abiertas

- ~~El envío de los pedidos por cantidad de la web~~ Resuelto el 2026-10-30: envío gratis desde
  $40.000 con reserva de 3 % y tramos 8 / 12 / 18 (spec 009).
- El permiso de promociones de ML para la app (spec 010): sin él no se ven las campañas a las que
  se puede sumar una publicación.

- ~~El recargo de 3 cuotas~~ Resuelto el 2026-10-29: en ventas reales ML cobra 8,5 % con la campaña de
  3 cuotas (el cotizador dice 12,9 %). Se usa lo cobrado por publicación; sin ventas, 8,5 %. Era:
  Agustín dice 8,9 %; el cotizador de ML devuelve 12,9 % para cualquier
  Premium. Se confirma con lo que ML cobró en las ventas reales antes de usarlo (spec 003, RN-4).
