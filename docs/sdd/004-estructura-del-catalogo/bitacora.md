---
feature: 004-estructura-del-catalogo
---

# Bitácora · Estructura del catálogo

Diario de sesiones. **Solo se agrega al final, nunca se reescribe.** Es lo primero que lee
el próximo agente o developer antes de seguir: acá queda lo que no entra en el código ni en
el SDD (qué se intentó, qué falló, cómo se resolvió, qué quedó a medias).

Si un problema puede volver a pasar en **otra** feature, además de anotarlo acá se lleva a
`01 - Inventario/INV - Bugs y fixes.md`.

---

## 2026-10-24 · Claude (sesión del inventario) — análisis y SDD

**Tareas:** ninguna empezada; el SDD espera la validación de Agustín.

**Qué pasó**
- Empezó como "una sola página para el modelo" (Agustín: "juntá todo en la página del modelo y
  sacá el lápiz"). Mientras se escribía, Agustín amplió el pedido: "investiguemos la forma más
  correcta de crear modelos con sus variantes y su stock, todo enlazado igual; no tengo tiempo
  para tocar mil cosas". La carpeta pasó de `004-pagina-del-modelo` a `004-estructura-del-catalogo`.
- Análisis sobre la base real: 9 lugares donde vive el catálogo; "modelo" quiere decir pieza en
  Bodega y producto en el ERP; el alta automática crea un producto por pieza (mal para colores y
  fundas); las 10 fundas son productos desactivados; el costo se escribe dos veces y se aplica a
  mano; las variantes no tienen grupo ni tipo.
- Decisiones de Agustín (en el chat): las katanas siguen por tamaño; los 8 personajes del BT21 son
  8 piezas (cambia lo decidido el 2026-10-18); convención "Producto · Opción" en Bodega; Bodega
  entra en la feature, y la sesión del inventario pasa a ser **dueña de Bodega**. Pidió no tocar el
  cerebro por ahora (TASK-017 queda bloqueada por eso).

**Hallazgos**
- **El lápiz borra el costo de insumos de cada variante al guardar** (`modelos/page.tsx:372` y
  `:462` no copian `costoInsumosAdicional`). Hay variantes "Con Funda" con $200 y $400. Es la
  TASK-001, que sale sola y primero.
- El botón "Editar" de la página del modelo vuelve a la lista: no edita nada.
- "Tanjiro v2 20cm" (la MiniKatana roja) estaba consolidado en "Tanjiro MiniKatana" (la negra). Se
  deshizo con `sdd-001-catalogo-shop.ts preparar` el mismo día; ver la bitácora del SDD 001.

**Para el que sigue**
- No se toca código (salvo TASK-001 si Agustín la pide) hasta la validación.
- La TASK-006 del SDD 003 (material de cada pieza en el costo) queda absorbida por la TASK-007 de
  esta feature.

## 2026-10-24 · Claude (sesión del inventario) — validación y la parte de datos y API

**Tareas:** TASK-001, 003, 004, 005, 006, 007 y 008 (→ completed); TASK-002 y TASK-015
(→ in-progress). Rama `feat/004-estructura-del-catalogo`. Nada commiteado ni desplegado.

**Qué pasó**
- Agustín validó el SDD ("dale apruebo el SDD"), con guardado por sección y consolidar/eliminar
  sólo en la página del producto.
- TASK-002: la parte 1 del SQL (columnas `grupo`, `tipo`, `es_insumo`, vacías) quedó aplicada en
  producción; el código desplegado no las ve. La simulación del relleno clasifica las 190
  variantes sin sorpresas; el relleno real espera el OK de Agustín (lo pide el SDD).
- Las fundas quedan **inactivas** además de `es_insumo`: así ningún selector de pedidos ni de
  mapeo cambia de comportamiento. La marca es lo que las separa de un producto discontinuado.
- Antes de prender el costo automático se simuló: hoy cambiaría un solo producto (el kunai, de
  $1.000 a $2.135, por estar en PETG Lite) porque **sólo 42 de 125 filas tienen receta en
  Bodega**. Por eso el costo queda editable a mano mientras ninguna pieza del producto esté
  costeada allá (ajuste a la spec 007, REQ-4).

**Problemas y cómo se resolvieron**
- *Dos piezas de un producto nuevo en la misma tanda* ("Bola · Rojo" y "Bola · Azul") creaban dos
  productos: el plan se arma una vez. `altaComoOpcion` busca el producto por nombre antes de
  crearlo. Lo encontró la prueba.
- *Cuando `tipo` sea obligatorio, el lápiz fallaría al crear una variante*: el PUT y el POST de
  `/api/modelos` le asignan grupo y tipo por nombre (como el relleno). También los scripts de
  prueba viejos del SDD 001.
- Exportar algo que no es un handler desde un `route.ts` rompe el build de Next: se sacó.

**Para el que sigue**
- Un producto simple al que se le suma un grupo de piezas conserva su fila propia (con la pieza
  vieja, si tenía): la ficha la muestra en `filasSobrantes` para que se decida a mano.
- Lo que falta: las pantallas (TASK-009 a 012), Bodega (TASK-013), borrar lo viejo (TASK-014),
  limpieza (TASK-016) y el cerebro (TASK-017, bloqueada hasta que Agustín diga).

## 2026-10-24 · Claude (sesión del inventario) — relleno, pantallas y Bodega

**Tareas:** TASK-002, 009, 010, 011, 012 y 015 (→ completed); TASK-013 (→ in-progress, falta la
release). Nada commiteado ni desplegado.

**Qué pasó**
- Con el OK de Agustín: relleno real de grupo y tipo (190 variantes, 10 insumos) y la parte 2
  (tipo obligatorio, `check ((tipo = 'pieza') = afecta_stock)`).
- **Parte 3, que no estaba en el SDD**: el ERP desplegado crea variantes sin tipo (el lápiz,
  "Agregar accesorio") y con la parte 2 eso fallaba en producción. Un trigger `before insert` las
  completa con las mismas reglas del relleno. Probado con inserts que imitan al código viejo, en
  una transacción deshecha.
- Pantallas: la página del producto (`components/producto/*`), la lista sin lápiz, Piezas nuevas
  en la lista, Integraciones sin SKUs ni Costos, "Productos" en el menú. `next build` completo.
- Como el ERP pide sesión, las pantallas se miraron con una página temporal `/vista-previa/[id]`
  que reemplaza `fetch` con datos falsos, con permiso sólo en desarrollo en el middleware. Se borró
  todo después (el middleware quedó igual que antes).
- Bodega (TASK-013, dueña desde hoy): "Pieza" en la interfaz, sin el mapeador de Configuración
  (el canal IPC `stock-erp:mapear` queda, sin uso), la convención en el alta y la categoría
  Insumos creada por la migración. `electron-vite build` OK; las pantallas, con el renderer
  compilado y un `window.api` falso.

**Para el que sigue**
- Las 10 fundas en Bodega siguen en la categoría Katanas/Grandes: ya son insumos en el ERP, así
  que no cambia nada, pero conviene moverlas a Insumos para que quede prolijo.
- El canal IPC del mapeador y `/api/costos/bodega`, `skus-audit`, `PUT /api/modelos/[id]`,
  `/accesorios` y `combinaciones-modelo.tsx` quedan sin uso: se borran en TASK-014, después de
  verificar en producción.
- `BOD - Flujos` e `INV - Flujos` cambian (se va el mapeador, se van dos pestañas, rutas nuevas):
  TASK-017, esperando que Agustín habilite el cerebro.
