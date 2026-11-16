---
id: 014
feature: modelos-en-el-erp
estado: draft
creado: 2026-11-16
---

# 014: Los modelos viven en el ERP

## Qué se quiere

Agustín, el 2026-11-16: dejar de usar la Bodega en forma local. Que los archivos de los modelos
pasen a la base y al ERP, para que Taiel, desde su Bodega, pueda bajarlos. Que en el ERP se cotice,
se suba el archivo y se cree el producto, "como debería ser", y que la Bodega se use sólo para bajar
los modelos y mandarlos a imprimir.

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
| Carpetas en la PC sin pieza en la nube | 13 |
| Peso de los archivos 3D en la PC | 806 MB (más 7,5 MB de miniaturas) |
| Archivo más grande | 229 MB; el segundo, 100 MB |
| Bucket público `modelos-3d` (3MF que se subían a mano a un producto) | 44 archivos, 258 MB |
| Bucket privado `archivos-3d` (biblioteca del SDD 012) | vacío, hasta 500 MB por archivo |
| Productos del ERP | 171: 116 con pieza de Bodega; de los 55 sin pieza, 51 inactivos o consolidados |

Con Supabase Pro (100 GB), mudar todo ocupa menos del 1 %.

## Cómo queda

1. **El ERP es el dueño de la pieza**: su archivo, su miniatura, los gramos, el tiempo y el material.
   Los archivos van al almacenamiento privado, no al público.
2. **Un producto nuevo nace en el ERP.** Se sube el archivo (o no, para kits y repuestos); el ERP
   lee del 3MF los gramos, el tiempo y la miniatura, muestra el costo y los precios como el
   cotizador, y crea el producto con su pieza y su fila de stock enganchadas.
3. **La Bodega pasa a ser el cliente del taller.** Baja la lista de piezas del ERP, descarga el
   archivo cuando hace falta (y lo guarda para usarlo sin internet) y lo abre en Bambu Studio. Sigue
   haciendo lo que hace bien: impresoras en vivo, cola, stock y etiquetas.

Se hace en tres etapas, y cada una deja todo funcionando:

| Etapa | Qué cambia | Spec |
|---|---|---|
| 1. Los archivos a la nube | Se suben los 91 archivos y se enganchan a su pieza. En el ERP se ven, se bajan y se reemplazan. La Bodega sigue igual. | [001](specs/001-archivos-en-la-nube.md) |
| 2. Crear en el ERP | "Nuevo producto" con archivo. El cotizador puede crear el producto. | [002](specs/002-crear-desde-el-erp.md) |
| 3. La Bodega como cliente | La Bodega baja las piezas y los archivos del ERP y deja de crearlas. | [003](specs/003-cambios-en-bodega.md) |

## El botón "Nuevo producto" (pregunta de Agustín, 2026-11-16)

**Hoy casi no se usa, pero con este SDD pasa a ser la puerta principal.** Hoy crea un producto con
sólo el nombre y la serie (`src/app/(app)/modelos/page.tsx:531`); lo normal es que el producto
aparezca solo cuando la pieza nace en la Bodega. De los productos activos, sólo 4 no tienen pieza
(Repuesto Steel ball, Soporte de Katana, Porta sabanas x4 y Kit K4os, creados entre septiembre y
noviembre): esos salieron del botón.

Con la etapa 2, el botón **no se saca, se transforma**: abre el alta con el archivo (spec 002). Sin
archivo sigue sirviendo para kits, repuestos y cosas que no se fabrican. El que se va es **"Traer de
Bodega"**: cuando nada nace en la Bodega (etapa 3), no hay nada que traer.

## Reglas

- **RN-1.** Nada se borra de la PC del taller hasta que la etapa 3 esté en uso y verificada; la
  migración copia, no mueve.
- **RN-2.** La pieza conserva su id de siempre: productos, recetas, stock y cola no se desenganchan.
- **RN-3.** Los archivos son privados: se bajan con links que vencen, desde el ERP o la Bodega con
  sesión iniciada. Nada de links públicos.
- **RN-4.** Reemplazar el archivo de una pieza actualiza los gramos y el tiempo leídos del 3MF, y la
  Bodega baja la versión nueva la próxima vez que lo abre.
- **RN-5.** Las piezas sin archivo siguen siendo válidas: el archivo se agrega cuando haga falta.
- **RN-6.** Mandar a imprimir sin abrir Bambu Studio queda fuera: la Bodega hoy sólo pausa, reanuda,
  frena y cambia la velocidad (`Bodega/Bodega3D-App/src/main/bambu.ts:887`), y Bambu fue cerrando
  el acceso de apps de terceros. Se abre en Bambu Studio y se manda desde ahí.

## Preguntas abiertas

Ver cada spec. Las que deciden el alcance:

- [ ] **Las 13 carpetas sin pieza en la nube**: ¿se suben a la biblioteca sueltas, para revisarlas,
  o se dejan afuera? (propuesta: sueltas, en la carpeta "Sin pieza").
- [ ] **El bucket público `modelos-3d`**: ¿se pasan esos 44 archivos al privado y se deja de usar?
  (propuesta: sí, en la etapa 1).
- [ ] **La Bodega de Taiel**: ¿tiene la app instalada y su propio usuario del ERP para iniciar
  sesión? La descarga necesita sesión.
