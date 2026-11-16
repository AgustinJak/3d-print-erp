---
id: 001-archivos-en-la-nube
feature: 014-modelos-en-el-erp
titulo: Cada pieza de Bodega tiene su archivo en el almacenamiento privado del ERP
estado: draft
actualizado: 2026-11-16
---

# Los archivos de las piezas, en la nube

## Contexto
Los archivos de las 91 piezas con archivo están sólo en la PC del taller
(`%APPDATA%\bodega-3d\storage\models\<id>\`). Esta etapa los copia al bucket privado `archivos-3d`
y los engancha a su pieza, sin cambiar todavía cómo se crean las piezas ni cómo trabaja la Bodega.

## Requisitos
- **REQ-1** — Un script sube el archivo 3D y la miniatura de cada carpeta local al bucket privado.
- **REQ-2** — Cada archivo subido queda en la biblioteca (`archivos_3d`) enganchado a su pieza por
  el id de la pieza.
- **REQ-3** — El script tiene un modo de prueba que lista qué subiría, sin subir nada.
- **REQ-4** — El script se puede volver a correr: lo que ya está subido y no cambió se saltea.
- **REQ-5** — La página de cada producto muestra el archivo de cada pieza, con la miniatura, para
  verlo en el visor 3D y bajarlo.
- **REQ-6** — Desde la página del producto se puede subir o reemplazar el archivo de una pieza.
- **REQ-7** — Al subir o reemplazar un 3MF, el ERP lee los gramos y el tiempo y los propone para la
  receta de la pieza.
- **REQ-8** — Los 3MF del bucket público `modelos-3d` pasan al privado y el producto deja de usar el
  link público (si se valida la pregunta abierta).

## Reglas de negocio
- **RN-1** — Ruta en el bucket: `piezas/<id de la pieza>/<nombre del archivo>`; miniatura:
  `piezas/<id>/preview.png`.
- **RN-2** — Una pieza tiene a lo sumo un archivo vigente. Reemplazarlo borra el anterior del
  almacenamiento.
- **RN-3** — Gramos y tiempo salen de `Metadata/slice_info.config` sumando todas las placas (misma
  lógica que `Bodega/Bodega3D-App/src/main/storage.ts:17`). Un 3MF sin laminar no trae datos: se
  avisa y la receta queda como estaba.
- **RN-4** — Aplicar los gramos y el tiempo leídos a la receta es una confirmación aparte: el
  archivo puede haberse laminado con otra configuración.
- **RN-5** — La migración no borra nada de la PC.

## Criterios de aceptación
- [ ] **CA-1** — Dado el modo de prueba, cuando corre, entonces lista las 91 piezas con archivo, las
  13 carpetas sin pieza y el total en MB, sin escribir nada.
- [ ] **CA-2** — Dado el script real, cuando termina, entonces hay 91 filas en `archivos_3d` con
  pieza, y la suma de tamaños coincide con la de la PC.
- [ ] **CA-3** — Dado el archivo de 229 MB, cuando se sube, entonces termina sin error.
- [ ] **CA-4** — Dado un producto con pieza con archivo, cuando abro su página, entonces veo la
  miniatura y puedo bajarlo con un link que vence.
- [ ] **CA-5** — Dado un 3MF laminado, cuando lo subo a una pieza, entonces veo los gramos y el
  tiempo leídos y un botón para aplicarlos a la receta.
- [ ] **CA-6** — Dado que se corre el script dos veces, entonces la segunda no sube nada.

## Casos borde
- Una carpeta con más de un archivo 3D: se sube el que figura en la pieza local; los demás se
  listan para revisar.
- Un corte a mitad de la subida: la fila queda con `subido = false` y la próxima corrida la retoma.
- Un archivo más grande que el límite del proyecto: el script lo informa y sigue con el resto.

## Fuera de alcance
- Cambiar cómo se crean las piezas (spec 002) o la Bodega (spec 003).
- Borrar archivos de la PC del taller.

## Preguntas abiertas
- [ ] Las 13 carpetas sin pieza: ¿sueltas en la biblioteca o afuera?
- [ ] El bucket público `modelos-3d`: ¿se migra y se deja de usar?
- [ ] El límite global de subida del proyecto de Supabase: el bucket admite 500 MB, pero si el del
  proyecto es menor manda el menor. Se verifica con el archivo de 229 MB; si no alcanza, Agustín lo
  sube en Storage → Settings.

## Referencias
- Bodega: `src/main/storage.ts:17` (lectura del 3MF), `src/main/db.ts:21` (carpeta de datos).
- ERP: `prisma/sql/tareas-y-archivos.sql:48` (`archivos_3d`), `src/lib/tareas.ts:240-331`
  (biblioteca), `src/components/archivos/subir.ts:22` (subida firmada), `src/components/producto/fotos.tsx:99`
  (subida al bucket público).
