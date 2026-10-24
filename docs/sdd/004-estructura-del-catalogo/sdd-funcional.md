---
feature: 004-estructura-del-catalogo
epica: ninguna
estado: validated
autor: Agustín (pedido y decisiones) · Claude (análisis y redacción)
actualizado: 2026-10-24
---

# SDD funcional · Estructura del catálogo

## 1. Objetivo
Que crear un producto, con sus variantes y su stock, sea un camino corto y siempre el mismo, y
que quede enlazado igual en Bodega, el ERP y los canales. Pedido de Agustín (2026-10-24): "hagamos
una buena estructura para que a futuro sea más limpio; no tengo tiempo para tocar mil cosas para
crear un modelo". Y: "siento que cada vez tenemos más deuda técnica y muchas ventanas al pedo".

Hoy el catálogo vive en 9 lugares (la lista de modelos, el lápiz, la página del modelo, Stock,
Categorías, Integraciones › Mercado Libre, Mapeo, Costos y SKUs, y en Bodega la calculadora y su
mapeador). Al terminar quedan 4: **Bodega** (las piezas y su costo), **Productos** en el ERP (todo
lo demás, en una página por producto), **Stock** (cuánto hay) e **Integraciones › Mapeo** (sólo
cuando un canal trae algo que no se reconoce solo).

## 2. El modelo: cuatro palabras
| Palabra | Dónde vive | Qué es | Ejemplos |
|---|---|---|---|
| **Pieza** | Bodega | Lo que se imprime. Archivo, gramos, horas, material → costo. Tiene stock. | "Bola de JOJOS · Verde común", "Tanjiro Katana nueva 95cm", "Funda 65cm Demon Slayer" |
| **Producto** | ERP | Lo que se vende. Nombre, SKU, fotos, precio. | "Bola de JOJOS", "Tanjiro Katana nueva 95cm" |
| **Grupo de variantes** | ERP, dentro del producto | Una elección con opciones, de uno de tres tipos (abajo). | Color, Funda, Diseño, Firma |
| **Insumo** | ERP | Una pieza que no se vende sola y que un producto consume. | Las fundas |

Los tres tipos de grupo:

| Tipo | Qué significa | Stock | Ejemplos |
|---|---|---|---|
| **Otra pieza** | Cada opción se imprime aparte | Una fila por opción, cada una con su pieza de Bodega | Colores de la Bola de JOJOS, diseños de la jabonera, personajes del BT21 |
| **Insumo** | "Con X" descuenta un insumo; "Sin X", no | El del producto, más el insumo en "Con X" | La funda de cada katana (compartida o propia) |
| **Solo decoración** | Misma pieza, distinta terminación | Una sola fila para todas las opciones | Las firmas del Vaso BTS |

Lo que el cliente compra es una **combinación**: el producto con una opción de cada grupo ("Bola
de JOJOS · Verde común", "Tanjiro Katana nueva 95cm · Con Funda"). Su costo es la suma de lo que
cuestan en Bodega las piezas que consume, y **nunca se carga a mano**.

## 3. Actores y permisos
| Actor | Qué puede hacer en esta feature |
|---|---|
| Admin (Agustín, Shay) | Todo. |
| Cuenta demo | Sus propios productos, como hoy. No ve piezas de Bodega (Bodega es de un solo negocio). |

## 4. Flujos

### 4.1 Producto simple
1. En Bodega: nueva pieza "Hacha Prime", calculadora.
2. El ERP crea el producto solo, con su fila de stock enganchada y su costo.
3. En la página del producto: serie y categoría ("Generar" SKU) y precio.
4. Se publica en ML y el Shop. Si el SKU o el nombre coinciden, la primera venta se reconoce sola;
   si no, se elige una vez en Mapeo.

### 4.2 Producto con colores o diseños
1. En Bodega: piezas "Bola de JOJOS · Verde común" y "Bola de JOJOS · Verde metalizado"
   (convención **"Producto · Opción"**).
2. El ERP arma **un** producto "Bola de JOJOS" con un grupo "otra pieza" y las dos opciones, cada una
   enganchada a su pieza. En la página se le pone nombre al grupo ("Color").
3. En el Shop, un producto con el grupo Color y las mismas opciones: se reconoce solo.

También se puede empezar desde el ERP: en la página del producto, "Agregar grupo" → otra pieza →
opciones; y cuando las piezas aparecen en Bodega con la convención, se enganchan solas.

### 4.3 Katana con funda
1. En Bodega: la pieza "Tanjiro Katana nueva 95cm" → el ERP crea el producto (cada tamaño es su
   propio producto: decisión del 2026-10-24).
2. En la página del producto: "Agregar grupo" → insumo → "Funda" → elegir de la lista de insumos
   ("Funda 95cm Demon Slayer · usada por 8 productos") o una propia.
3. Una funda propia nueva: pieza en Bodega en la categoría **Insumos** → aparece en la lista.

### 4.4 Cambiar algo
Tocar el producto en la lista (sin lápiz), editar la sección y "Guardar" en esa sección.

## 5. Reglas de negocio
- **RN-1** — Un producto tiene a lo sumo un grupo "otra pieza" y uno "insumo"; de decoración, los
  que hagan falta.
- **RN-2** — El costo sale de las piezas (spec 007). Sólo un producto sin pieza (algo que no se
  imprime) tiene costo a mano.
- **RN-3** — Guardar una sección nunca cambia otra. Renombrar no rompe nada.
- **RN-4** — Lo vendido no cambia: cada línea de pedido guarda su costo al venderse.

## 6. Pantallas
| Pantalla | Qué muestra | Qué permite |
|---|---|---|
| Productos (`/modelos`) | La lista, sin insumos; filtros Sin SKU e Insumos; "Piezas nuevas" si hay | Abrir un producto; "Nuevo producto" (sólo nombre) |
| Página del producto (`/modelos/[id]`) | Encabezado (estado, SKU, precio, costo, margen), Datos, Fotos, Precio y costo, Variantes, Lo que se vende, Dónde se vende | Todo; consolidar y eliminar desde el menú |
| Bodega › Piezas | Lo de hoy, diciendo "Pieza" y con la convención a la vista | Crear y costear piezas |

**Se van**: el lápiz y su diálogo, Integraciones › SKUs, Integraciones › Costos, el costo cargado a
mano y Bodega › Configuración › Stock del ERP.

## 7. Specs
| Spec | Qué define |
|---|---|
| [001-una-sola-pagina](specs/001-una-sola-pagina.md) | La página es el único lugar; adiós lápiz y pestaña SKUs; "Productos" |
| [002-datos-precio-y-fotos](specs/002-datos-precio-y-fotos.md) | Edición por sección; el arreglo de los insumos de las variantes |
| [003-grupos-de-variantes](specs/003-grupos-de-variantes.md) | Grupos con tipo; piezas e insumos en cada opción; renombrar sin romper |
| [004-donde-se-vende](specs/004-donde-se-vende.md) | Publicaciones y claves de los canales que llegan al producto |
| [005-alta-desde-bodega](specs/005-alta-desde-bodega.md) | "Producto · Opción", categoría Insumos y Piezas nuevas |
| [006-insumos](specs/006-insumos.md) | Las fundas como insumos; elegir de una lista con "usada por N" |
| [007-costo-desde-las-piezas](specs/007-costo-desde-las-piezas.md) | Costo automático con el material de cada pieza; adiós Integraciones › Costos |
| [008-cambios-en-bodega](specs/008-cambios-en-bodega.md) | "Piezas", la convención a la vista, adiós mapeador |

## 8. Fuera de alcance
- Un producto por personaje con el tamaño como variante (las katanas siguen por tamaño).
- Que el ERP cree piezas en Bodega o productos en el Shop.
- Precios desde Bodega y escritura en los canales: SDD 003, que se apoya en esta.

## 9. Dependencias
- SDD 001 (combinaciones, recetas y mapeo por canal): en producción.
- SDD 003: su TASK-006 (material de cada pieza en el costo del ERP) pasa a esta feature (spec 007).
- **Bug a arreglar primero**: el lápiz pone en 0 el costo de insumos de las variantes al guardar
  (spec 002). Hasta que salga, no guardar con el lápiz productos con funda.
- Limpieza de datos con Agustín: 30 productos consolidados, 30 inactivos y 17 piezas de Bodega
  sueltas (pruebas y duplicados).

## 10. Decisiones tomadas
| Fecha | Decisión | Por qué | Quién |
|---|---|---|---|
| 2026-10-24 | Todo en la página del producto; sin lápiz | "Es mucho mareo" | Agustín |
| 2026-10-24 | Cada tamaño de katana sigue siendo su propio producto | Así lo piensa Agustín y así publica ML; el mapeo ya resuelve el producto único del Shop | Agustín |
| 2026-10-24 | Los 8 personajes del BT21 son 8 piezas | Cada uno se imprime aparte. Cambia lo decidido el 2026-10-18 (base compartida) | Agustín |
| 2026-10-24 | Convención "Producto · Opción" en Bodega | El ERP arma solo el producto con variantes | Agustín |
| 2026-10-24 | Bodega entra en la feature (spec 008) | La sesión del inventario pasa a ser dueña de Bodega | Agustín |
| 2026-10-24 | Grupo y tipo de variante, guardados explícitos | Hoy no existe el grupo, y el tipo deducido por nombre ("Con …") falla con nombres raros | Claude |

## 11. Preguntas abiertas
- [x] ¿Guardar por sección con botón? Sí (Agustín, 2026-10-24).
- [x] ¿Consolidar y eliminar sólo en la página del producto? Sí (Agustín, 2026-10-24).
