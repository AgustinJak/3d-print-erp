---
id: 014
feature: modelos-en-el-erp
estado: validated
creado: 2026-11-16
actualizado: 2026-11-16
---

# 014: Los modelos viven en el ERP

## Qué se quiere

Agustín, el 2026-11-16: dejar de usar la Bodega en forma local. Que los archivos de los modelos
pasen a la base y al ERP, para que Taiel, desde su Bodega, pueda bajarlos. Que en el ERP se cotice,
se suba el archivo y se cree el producto, "como debería ser", y que la Bodega se use sólo para bajar
los modelos y mandarlos a imprimir.

Y después: "crear un producto y que se le puedan subir varios modelos para las variantes, tanto de
colores como lo que sea, y agregar modelos como insumos, como las fundas".

## Por qué

Hoy la Bodega de la PC del taller es el origen de las piezas y la única dueña de los archivos: la
sincronización sube sólo datos ("Solo viajan DATOS: no se suben archivos .3mf/.stl ni imágenes",
`Bodega/Bodega3D-App/src/main/sync.ts:16`), y una pieza que no existe en esa PC no se crea ("los
archivos viven acá", `sync.ts:373`). Eso trae tres problemas:

- **Una sola PC.** Taiel no puede bajarse un modelo desde otra máquina.
- **Un solo disco.** Si esa PC se rompe, se pierden los archivos. Los backups locales también están
  ahí (131 MB).
- **Dos lugares para crear.** El producto nace en la Bodega y aparece solo en el ERP
  (`src/lib/altas-bodega.ts`), pero el precio, el costo, el cotizador y la biblioteca de archivos ya
  están en el ERP.

## Lo que hay hoy (medido el 2026-11-16)

| Qué | Cuánto |
|---|---|
| Piezas en la nube (`bodega.models`) | 160 |
| De esas, con archivo en la PC del taller | 91 |
| De esas, sin archivo (creadas para mapear variantes) | 69; 63 usadas por el ERP |
| Carpetas en la PC sin pieza en la nube | 13 (quedan afuera) |
| Archivos en la PC | 103 3MF y 1 STL: 806 MB, más 7,5 MB de miniaturas |
| Archivo más grande | 229 MB; el segundo, 100 MB |
| 3MF con varias placas | 87 de 103. `Jabonera.3mf` tiene 17, una por diseño, sin nombre |
| 3MF laminados (con gramos y tiempo adentro) | 0 de 103 |
| Bucket público `modelos-3d` (3MF que se subían a mano a un producto) | 44 archivos, 258 MB |
| Bucket privado `archivos-3d` (biblioteca del SDD 012) | vacío, hasta 500 MB por archivo |
| Productos del ERP | 171: 116 con pieza de Bodega; de los 55 sin pieza, 51 inactivos o consolidados |

Con Supabase Pro (100 GB), mudar todo ocupa menos del 1 %.

**Dos datos que cambian el diseño.** Ningún 3MF guardado está laminado, así que hoy los gramos y
el tiempo no se pueden leer del archivo: se siguen cargando a mano (como en el cotizador), y se
leen sólo si el proyecto se guarda después de laminar. Y casi todos tienen varias placas, pero las
placas no siempre son variantes: una katana grande va partida en placas.

## Cómo queda

1. **El ERP es el dueño de la pieza**: su archivo, su miniatura, los gramos, el tiempo y el material.
   Los archivos van al almacenamiento privado, no al público.
2. **Un producto nuevo nace en el ERP, con sus variantes y sus insumos.** En el alta se sube el
   archivo (o no, para kits y repuestos), se cargan las variantes y cada una puede tener su archivo,
   una placa de un archivo compartido o el mismo archivo que las demás. El insumo (la funda) se elige
   de la lista o se crea ahí mismo subiendo su archivo.
3. **La Bodega pasa a ser el cliente del taller.** Baja la lista de piezas del ERP, descarga el
   archivo cuando hace falta (y lo guarda para usarlo sin internet) y lo abre en Bambu Studio, con la
   placa que corresponde. Sigue haciendo lo que hace bien: impresoras en vivo, cola, stock y
   etiquetas.

Se hace en tres etapas, y cada una deja todo funcionando:

| Etapa | Qué cambia | Spec |
|---|---|---|
| 1. Los archivos a la nube | Se suben los 91 archivos y los 44 del bucket público, y se enganchan a sus piezas. En el ERP se ven, se bajan y se reemplazan. La Bodega sigue igual. | [001](specs/001-archivos-en-la-nube.md) |
| 2. Crear en el ERP | "Nuevo producto" con archivo, variantes con sus modelos e insumos con el suyo. El cotizador puede crear el producto. | [002](specs/002-crear-desde-el-erp.md) |
| 3. La Bodega como cliente | La Bodega baja las piezas y los archivos del ERP y deja de crearlas. | [003](specs/003-cambios-en-bodega.md) |

## Variantes e insumos con sus modelos

Se apoya en lo que ya existe desde el SDD 004 (spec 003, grupos de variantes): un grupo "otra
pieza" (Color, Diseño, Personaje) abre una pieza y una fila de stock por opción, y un grupo
"insumo" (Funda) descuenta un insumo con "Con X". Lo nuevo es que **cada pieza puede tener un
modelo**, y el modelo se elige de tres formas:

| Caso | Ejemplo | Cómo se carga |
|---|---|---|
| Un archivo por opción | Personajes del BT21, un STL o 3MF cada uno | Se suelta un archivo en cada opción |
| Un archivo con una placa por opción | `Jabonera.3mf`: 17 placas, un diseño por placa | Se suelta el archivo una vez; el ERP muestra la miniatura de cada placa y se elige cuál es cada opción |
| El mismo archivo para todas | Colores de la Bola de JOJOS: se imprime igual, cambia el filamento | Se suelta el archivo en el producto y las opciones lo comparten; el stock sigue siendo por color |

Los insumos (fundas) son productos marcados como insumo con su propia pieza (SDD 004, spec 006).
Al armar el grupo "insumo" se elige uno existente ("usada por 16 productos") o se crea uno nuevo
subiendo su archivo, sin salir del alta.

## El botón "Nuevo producto" (pregunta de Agustín, 2026-11-16)

**Hoy casi no se usa, pero con este SDD pasa a ser la puerta principal.** Hoy crea un producto con
sólo el nombre y la serie (`src/app/(app)/modelos/page.tsx:531`); lo normal es que el producto
aparezca solo cuando la pieza nace en la Bodega. De los productos activos, sólo 4 no tienen pieza
(Repuesto Steel ball, Soporte de Katana, Porta sabanas x4 y Kit K4os, creados entre septiembre y
noviembre): esos salieron del botón.

Con la etapa 2, el botón **no se saca, se transforma**: abre el alta con archivo, variantes e
insumos (spec 002). Sin archivo sigue sirviendo para kits, repuestos y cosas que no se fabrican. El
que se va es **"Traer de Bodega"**: cuando nada nace en la Bodega (etapa 3), no hay nada que traer.

## Reglas

- **RN-1.** Nada se borra de la PC del taller hasta que la etapa 3 esté en uso y verificada; la
  migración copia, no mueve.
- **RN-2.** La pieza conserva su id de siempre: productos, recetas, stock y cola no se desenganchan.
- **RN-3.** Los archivos son privados: se bajan con links que vencen, desde el ERP o la Bodega con
  sesión iniciada. Nada de links públicos.
- **RN-4.** Un archivo puede ser de varias piezas (colores, placas); una pieza tiene a lo sumo un
  archivo, y puede decir qué placa es.
- **RN-5.** Reemplazar un archivo lo cambia para todas las piezas que lo usan, y la Bodega baja la
  versión nueva la próxima vez que lo abre.
- **RN-6.** Las piezas sin archivo siguen siendo válidas: el archivo se agrega cuando haga falta.
- **RN-7.** Gramos y tiempo: se leen del 3MF si está laminado (por placa); si no, se cargan a mano.
- **RN-8.** Mandar a imprimir sin abrir Bambu Studio queda fuera: la Bodega hoy sólo pausa, reanuda,
  frena y cambia la velocidad (`Bodega/Bodega3D-App/src/main/bambu.ts:887`), y Bambu fue cerrando
  el acceso de apps de terceros. Se abre en Bambu Studio y se manda desde ahí.

## Decisiones (Agustín, 2026-11-16)

| Tema | Decisión |
|---|---|
| Las 13 carpetas sin pieza | Quedan afuera. |
| Bucket público `modelos-3d` | Sus 44 archivos pasan al privado y se deja de usar. |
| Taiel | Tiene la Bodega instalada y su propio usuario del ERP (Taiel Cleiman). |
| Variantes e insumos | Un producto se crea con sus variantes, cada una con su modelo, y con sus insumos, que también pueden tener modelo. |
