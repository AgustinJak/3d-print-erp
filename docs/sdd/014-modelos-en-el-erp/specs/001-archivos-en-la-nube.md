---
id: 001-archivos-en-la-nube
feature: 014-modelos-en-el-erp
titulo: Cada pieza de Bodega tiene su archivo en el almacenamiento privado del ERP
estado: validated
actualizado: 2026-11-16
---

# Los archivos de las piezas, en la nube

## Contexto
Los archivos de las 91 piezas con archivo están sólo en la PC del taller
(`%APPDATA%\bodega-3d\storage\models\<id>\`), y 44 3MF más están en el bucket público `modelos-3d`
enganchados al producto (`modelos.archivo_3mf_url`). Esta etapa los pasa al bucket privado
`archivos-3d` y los engancha a sus piezas, sin cambiar todavía cómo se crean las piezas ni cómo
trabaja la Bodega.

## Requisitos
- **REQ-1** — Un script sube el archivo 3D y la miniatura de cada carpeta local con pieza en la nube.
- **REQ-2** — Cada archivo subido queda en la biblioteca (`archivos_3d`) y enganchado a su pieza.
- **REQ-3** — El script tiene un modo de prueba que lista qué subiría, sin subir nada.
- **REQ-4** — El script se puede volver a correr: lo que ya está subido y no cambió se saltea.
- **REQ-5** — Los 44 3MF del bucket público pasan al privado. Si el producto tiene una sola pieza,
  se engancha a ella; si no, quedan en la biblioteca, en la carpeta del producto.
- **REQ-6** — El producto deja de usar el link público y el bucket `modelos-3d` deja de recibir archivos.
- **REQ-7** — La página de cada producto muestra el archivo de cada pieza, con la miniatura (la de
  su placa, si la tiene), para verlo en el visor 3D y bajarlo.
- **REQ-8** — Desde la página del producto se puede subir, reemplazar o elegir el archivo de una
  pieza, y decir qué placa es.
- **REQ-9** — Al subir un 3MF, el ERP lee sus placas con la miniatura y, si está laminado, los
  gramos y el tiempo de cada una.

## Reglas de negocio
- **RN-1** — Ruta en el bucket: `piezas/<id del archivo>/<nombre del archivo>`, porque un archivo
  puede ser de varias piezas.
- **RN-2** — Una pieza tiene a lo sumo un archivo y, opcional, el número de placa. Un archivo puede
  ser de varias piezas.
- **RN-3** — Reemplazar un archivo cambia el de todas las piezas que lo usan y borra el anterior del
  almacenamiento, después de confirmar cuántas piezas afecta.
- **RN-4** — Gramos y tiempo salen de `Metadata/slice_info.config`, placa por placa (misma lectura
  que `Bodega/Bodega3D-App/src/main/storage.ts:17`, que hoy suma todas). Sin laminar no traen datos:
  la receta queda como estaba. Al 2026-11-16 ningún 3MF guardado está laminado.
- **RN-5** — Aplicar los gramos y el tiempo leídos a la receta es una confirmación aparte.
- **RN-6** — Las placas se leen de `Metadata/model_settings.config` (`plater_id`, `plater_name`) y la
  miniatura de `Metadata/plate_<n>.png`. Una placa sin nombre se muestra como "Placa n".
- **RN-7** — La migración no borra nada de la PC. Las 13 carpetas sin pieza quedan afuera
  (decisión de Agustín, 2026-11-16).

## Criterios de aceptación
- [ ] **CA-1** — Dado el modo de prueba, cuando corre, entonces lista las 91 piezas con archivo, las
  13 carpetas que quedan afuera y el total en MB, sin escribir nada.
- [ ] **CA-2** — Dado el script real, cuando termina, entonces las 91 piezas tienen archivo y la suma
  de tamaños coincide con la de la PC.
- [ ] **CA-3** — Dado el archivo de 229 MB, cuando se sube, entonces termina sin error.
- [ ] **CA-4** — Dado un producto con pieza con archivo, cuando abro su página, entonces veo la
  miniatura y puedo bajarlo con un link que vence.
- [ ] **CA-5** — Dado `Jabonera.3mf`, cuando lo subo, entonces veo sus 17 placas con su miniatura.
- [ ] **CA-6** — Dado que se corre el script dos veces, entonces la segunda no sube nada.
- [ ] **CA-7** — Dado el bucket público, después de migrar ningún producto apunta a `modelos-3d`.

## Casos borde
- Una carpeta con más de un archivo 3D: se sube el que figura en la pieza local; los demás se
  listan para revisar.
- Un corte a mitad de la subida: la fila queda con `subido = false` y la próxima corrida la retoma.
- Un archivo más grande que el límite del proyecto: el script lo informa y sigue con el resto.
- El mismo archivo en la PC y en el bucket público: se sube una sola vez (se compara el hash).

## Fuera de alcance
- Cambiar cómo se crean las piezas (spec 002) o la Bodega (spec 003).
- Borrar archivos de la PC del taller.
- Tomar gramos y tiempo del historial de impresiones de Bambu (la Bodega ya los guarda en
  `print_jobs`): queda como idea para después.

## Preguntas abiertas
- [ ] El límite global de subida del proyecto de Supabase: el bucket admite 500 MB, pero si el del
  proyecto es menor manda el menor. Se verifica con el archivo de 229 MB; si no alcanza, Agustín lo
  sube en Storage → Settings.

## Referencias
- Bodega: `src/main/storage.ts:17` (lectura del 3MF), `src/main/db.ts:21` (carpeta de datos).
- ERP: `prisma/sql/tareas-y-archivos.sql:48` (`archivos_3d`), `src/lib/tareas.ts:240-331`
  (biblioteca), `src/components/archivos/subir.ts:22` (subida firmada), `src/components/producto/fotos.tsx:99`
  (subida al bucket público).
