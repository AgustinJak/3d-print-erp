---
id: 002-crear-desde-el-erp
feature: 014-modelos-en-el-erp
titulo: Un producto se crea en el ERP con su archivo, sus variantes con sus modelos y sus insumos
estado: validated
actualizado: 2026-11-16
---

# Crear el producto en el ERP

## Contexto
Hoy un producto nuevo nace en la Bodega y el ERP lo da de alta solo (`src/lib/altas-bodega.ts`).
"Nuevo producto" crea sólo un nombre (`src/app/(app)/modelos/page.tsx:531`) y se usó para 4
productos activos sin pieza. Las variantes y los insumos se arman después, en la página del
producto (SDD 004, specs 003 y 006), eligiendo piezas que ya existen en la Bodega o creándolas a
mano sin archivo. Con el costo, el precio, el cotizador y los archivos en el ERP, el alta entera
tiene que pasar acá.

## Requisitos
- **REQ-1** — "Nuevo producto" abre un alta con nombre, serie, material y un archivo 3D opcional.
- **REQ-2** — El alta muestra el costo y los precios por canal, igual que el cotizador, con los
  gramos y el tiempo leídos del archivo o cargados a mano.
- **REQ-3** — En el alta se puede agregar un grupo de variantes "otra pieza" (Color, Diseño,
  Personaje) con sus opciones, una por renglón.
- **REQ-4** — Cada opción puede llevar su propio archivo, una placa de un archivo del producto o el
  mismo archivo que el producto.
- **REQ-5** — Al soltar un 3MF con varias placas en el grupo, el alta muestra la miniatura de cada
  placa y propone una opción por placa, con el nombre de la placa si lo tiene.
- **REQ-6** — Cada opción puede tener sus propios gramos y tiempo; vacíos, usa los del producto.
- **REQ-7** — En el alta se puede agregar un grupo "insumo" ("Con funda" / "Sin funda") eligiendo un
  insumo de la lista, con "usado por N productos".
- **REQ-8** — Si el insumo no existe, se crea en el mismo lugar con nombre y archivo, y queda
  disponible para otros productos.
- **REQ-9** — Al confirmar, se crean el producto, una pieza en `bodega.models` y una fila de stock
  enganchada por cada pieza física, las combinaciones, las recetas de insumo y los enganches a los
  archivos.
- **REQ-10** — Sin archivo y sin variantes, el alta crea el producto solo, como hoy (kits,
  repuestos, reventa).
- **REQ-11** — En la página de un producto existente se pueden hacer las mismas cosas: agregar una
  opción con su modelo o elegir la placa de cada opción.
- **REQ-12** — En la lista de insumos se puede crear un insumo con su archivo.
- **REQ-13** — El cotizador tiene "Crear producto con esto", que abre el alta con lo cargado.
- **REQ-14** — "Traer de Bodega" se saca cuando la etapa 3 está en uso.

## Reglas de negocio
- **RN-1** — Valen las reglas del SDD 004 (spec 003): a lo sumo un grupo "otra pieza" y un grupo
  "insumo" por producto; grupos de decoración, los que hagan falta. Las katanas siguen siendo un
  producto por tamaño.
- **RN-2** — Una opción de un grupo "otra pieza" es una pieza con su fila de stock, aunque comparta
  el archivo: los colores comparten modelo pero no stock.
- **RN-3** — El id de cada pieza nueva lo genera el ERP (UUID), con el mismo formato que la Bodega.
- **RN-4** — Cada pieza se crea enganchada a su fila de stock en el mismo paso, para que el alta
  automática (`altas-bodega.ts`) no la tome como nueva y duplique el producto.
- **RN-5** — El nombre de cada pieza es el del producto, o "Producto · Opción" si es una opción
  (convención del SDD 004). El de un insumo, su nombre ("Funda Yamato 95cm").
- **RN-6** — El material por defecto es el marcado como tal en `bodega.materials`; cada opción puede
  cambiarlo.
- **RN-7** — Todo el alta se guarda junto o no se guarda. Los archivos se suben después; si una
  subida falla, la pieza queda sin archivo y se avisa para reintentar.
- **RN-8** — Una placa sólo se ofrece como opción si el usuario la elige: en las katanas las placas
  son partes de la misma pieza, no variantes.

## Criterios de aceptación
- [ ] **CA-1** — Dado un 3MF laminado, cuando lo suelto en "Nuevo producto", entonces veo los gramos,
  el tiempo, la miniatura, el costo y los precios sin escribir nada.
- [ ] **CA-2** — Dado un 3MF sin laminar, entonces veo la miniatura y cargo gramos y tiempo a mano.
- [ ] **CA-3** — Dado `Jabonera.3mf` en un grupo "Diseño", entonces veo sus 17 placas, elijo cuáles
  son opciones y les pongo nombre; al confirmar hay una pieza y una fila de stock por diseño, todas
  con el mismo archivo y su placa.
- [ ] **CA-4** — Dado un grupo "Color" con Verde y Rojo y un solo archivo, entonces hay dos piezas y
  dos filas de stock con el mismo archivo.
- [ ] **CA-5** — Dado un grupo "Funda" con un insumo nuevo y su archivo, entonces se crea el insumo
  con su pieza y su fila de stock, "Con funda" lo descuenta y aparece en la lista de insumos.
- [ ] **CA-6** — Dado el alta confirmada, "Traer de Bodega" no trae nada.
- [ ] **CA-7** — Dado un alta sin archivo ni variantes, entonces se crea sólo el producto, como hoy.
- [ ] **CA-8** — Dado el cotizador con datos cargados, cuando toco "Crear producto con esto",
  entonces se abre el alta con esos datos.

## Casos borde
- Un archivo de cientos de MB: la lectura se hace en el navegador sin descomprimir los modelos
  (sólo los `.config` y las miniaturas).
- Un STL: no trae placas, gramos ni tiempo.
- Doble clic en confirmar: el alta no crea dos productos.
- Dos opciones con el mismo nombre: no se crea, se avisa.
- Un insumo nuevo con el mismo nombre que uno existente: se ofrece usar el existente.

## Fuera de alcance
- Que la Bodega deje de crear piezas (spec 003). Mientras tanto conviven las dos altas.
- Dos grupos "otra pieza" a la vez (tamaño y color): sigue fuera, como en el SDD 004.
- Publicar en canales: sigue como hoy, desde la página del producto.

## Preguntas abiertas
- [ ] ¿El alta pide también la categoría, o se completa después en la página?
  (propuesta: después, como hoy).

## Referencias
- ERP: `src/app/(app)/modelos/page.tsx:93,218,531`, `src/lib/altas-bodega.ts`,
  `src/lib/catalogo.ts` (`crearGrupo`, `agregarOpciones`), `src/lib/combinaciones.ts`,
  `src/lib/stock-filas.ts`, `src/lib/cotizador.ts`, `src/app/api/insumos/route.ts`.
- SDD 004: specs 003 (grupos de variantes) y 006 (insumos).
- Memoria del proceso manual que esto reemplaza: crear piezas sin archivo y engancharlas al ERP en
  el mismo paso (2026-08-28 y 2026-10-24).
