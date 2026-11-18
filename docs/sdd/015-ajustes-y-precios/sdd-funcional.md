---
id: 015
feature: ajustes-y-precios
estado: validated
creado: 2026-11-18
---

# 015: Ajustes de precio por producto y Precios rediseñada

## Qué se quiere

Agustín, el 2026-11-18: más configuraciones de precio por producto, no sólo el margen: "subirle un
3 % a Shop por alguna promoción u otra cantidad, cambiar el precio del envío agregado en cada
producto". Y que la página de Precios deje de parecer un Excel: "usá la habilidad para hacer una
mejora completa, no sólo colores".

## Decisiones (Agustín, 2026-11-18)

| Tema | Decisión |
|---|---|
| Ajustes nuevos | **% por canal** (ML, web, venta directa) y **envío propio** (ML y web). Precio fijo en la web y descuentos por cantidad propios, no por ahora. |
| Vencimiento | Cada ajuste puede tener **fecha de fin opcional**; vencido, deja de aplicarse solo. |
| Alcance | De a un producto o **a varios juntos** (una selección o una categoría), viendo antes cómo quedan. |
| Pantalla | Organizada **por producto**, con una ficha al costado. |

## Cómo queda

### Los ajustes (spec 001)

Además del margen, la promo de ML, el redondeo y el precio fijo en ML que ya existen:

- **% por canal**: +3 % en la web, −5 % en ML, otro en venta directa. Se aplica sobre el precio
  que calcula el motor en ese canal, antes de redondear. En ML el precio publicado se sigue
  inflando por la promo encima.
- **Envío propio**: lo que cuesta mandar ese producto, en ML y en la web, para piezas grandes o
  pesadas. En ML reemplaza el costo leído de la publicación o el general; en la web, el general.
- Cada uno con **fecha de fin opcional** y una **nota** ("promo Hot Sale"). Vencido, se ignora: no
  hace falta que nadie lo saque.

### La pantalla (spec 002), con la skill unslop

**Lo que hay hoy:** seis pestañas (Combinaciones, Mercado Libre, Web, ERP, Historial,
Configuración), cada una una tabla de muchas columnas con filtros arriba; un párrafo de
configuración general como subtítulo; el estado de cada fila en texto rojo o ámbar; los ajustes
de cada producto en otra pantalla. Para entender un producto hay que saltar entre pestañas.

**Dirección**

- **Producto:** el ERP de un taller que vende en ML, en su web y por encargo; esta página decide
  a cuánto se vende cada cosa en cada canal.
- **Carácter:** exacto, tranquilo, de un vistazo.
- **Mundo:** la etiqueta de precio del taller y la balanza: números claros, nada de adornos.
- **Momento:** la ficha del producto al costado: el precio de cada canal como una tira de tres
  etiquetas, con lo que deja, y debajo los ajustes con sus fechas.
- **Firma:** el ajuste activo como una etiqueta chica con su fecha ("+3 % web · hasta 30/11"),
  igual en la lista y en la ficha.

**Cómo se organiza**

1. Arriba: cuántos precios hay para actualizar en ML, en la web y en el ERP, y cuántos productos
   no se pueden calcular (falta la receta). Cada número filtra la lista.
2. La lista **por producto**: nombre, foto, y los tres canales con su precio de hoy y el nuevo,
   lo que deja, y las etiquetas de sus ajustes. Las combinaciones quedan adentro de la ficha.
3. Tocar un producto abre la **ficha al costado**: precio de cada canal con su desglose (qué se
   lleva cada uno), las combinaciones con su botón de aplicar, y los ajustes para editar.
4. Seleccionar varios: barra abajo con "Ajustar" (el mismo editor, con la vista previa de cómo
   quedan) y "Aplicar en ML / web".
5. Historial y Configuración general pasan a botones de la cabecera; lo que se aplica no cambia
   (nada sale sin confirmar, y lo que cambia más de 30 % pide confirmación aparte).

## Reglas

- **RN-1.** Ningún ajuste publica nada: cambian los precios propuestos; aplicarlos sigue siendo el
  click de siempre.
- **RN-2.** Un ajuste vencido no se aplica, y la pantalla lo muestra como vencido hasta que se
  borre o se renueve.
- **RN-3.** Un producto tiene a lo sumo un % por canal y un envío propio por canal.
- **RN-4.** El precio fijo de ML le gana al % de ML (el fijo es fijo).
- **RN-5.** El ajuste en masa muestra antes el precio de hoy y el nuevo de cada producto.
- **RN-6.** Lo que se publica sigue respetando las reglas de ML: nada automático (cada aplicación
  la confirma Agustín).

## Decisiones de las preguntas abiertas (Agustín, 2026-11-18)

- El % de la web se aplica también a los packs: el pack sale del precio de la unidad ya ajustado.
- El envío propio de ML cuenta sólo cuando el envío lo pagás vos (envío gratis), igual que el costo general.
