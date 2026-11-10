---
feature: 008-productos-en-cantidad
---

# Bitácora 008

## 2026-11-10 · Claude (sesión del inventario)

**Tareas:** TASK-001 a TASK-003 (completed), TASK-004 (pending).

**Pedido.** Agustín, con una captura del diálogo "A pedido, sin Flex: 172 publicaciones": mejorar
Productos para el trabajo de todos los días. Elegir por variante (el violeta sí, el blanco no),
elegir por filtros, agrupar y sumar un grupo a lo elegido, más órdenes, y más legible.

**Lo que se miró antes.** 108 productos activos, 38 con más de una variante (hasta 15), 223
publicaciones de ML y ninguna compartida entre dos variantes: elegir una variante es elegir sus
publicaciones, sin efectos sobre otra. 91 productos tienen serie, en 37 series; 25 no tienen
categoría. Todas las líneas de pedido tienen su combinación, así que lo vendido se cuenta por
variante sin huecos.

**Qué se hizo.**

- `GET /api/modelos/canales` cambió de forma: antes devolvía el mapa por producto, ahora
  `{ leidoEn, modelos }`, y cada producto trae sus variantes. La usa sólo Productos.
- La cuenta salió de la ruta a `canalesDeModelos` para poder probarla sin sesión.
- Lo elegido son claves de variante. Antes eran ids de producto y el tilde de arriba reemplazaba todo
  lo elegido; ahora cada tilde suma o saca lo suyo.
- Al abrir un diálogo en cantidad, la tanda queda fija. Antes se recalculaba en cada dibujo: al
  terminar de crear en ML se vaciaba lo elegido y el diálogo perdía la lista de lo creado.
- La columna de categorías pasó a un renglón debajo del nombre, y entraron Stock y Vendidos 30 d.
- El stock en cero va en gris, no en ámbar: casi todo se hace a pedido y la tabla quedaba toda
  pintada.
- La vista, el orden y el agrupado quedan guardados en el navegador (`productos:vista`).

**Cómo se probó.** 24 pruebas de la lógica. La pantalla, en el navegador con los datos reales
volcados a un archivo y las llamadas a la API simuladas (el panel pide sesión): buscar "nube", abrir
sus cinco colores, elegir dos, agrupar por serie, sumar el grupo, quedarse con las sin stock, abrir
el diálogo de a pedido (pidió sólo las dos publicaciones elegidas), filtrar "con stock" y "a
pedido", elegir todo lo filtrado, sacar los filtros sin perder lo elegido, ordenar por ventas y por
la columna de stock, tarjetas y ancho de teléfono. Sin errores en consola. No se mandó nada a ML.

**Lo que no se probó.** Un cambio real de entrega desde la pantalla nueva (TASK-004). El diálogo y el
endpoint son los de siempre; lo nuevo es qué publicaciones reciben.

**Para tener en cuenta.**

- "Bola de JOJOS" figura con 160 unidades en 30 días: es lo que dicen las líneas de pedido, no se
  revisó si son packs.
- Con seis variantes elegidas el botón puede decir "Flex (10)": son publicaciones, y una variante
  suele tener dos (Clásica y Premium).
- En el panel del navegador, con la ventana minimizada, un diálogo cerrado se siguió viendo unos
  segundos: es la animación de salida, que no avanza si la página no se dibuja.
