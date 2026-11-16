---
feature: 014-modelos-en-el-erp
---

# Bitácora · Los modelos viven en el ERP

Diario de sesiones. **Solo se agrega al final, nunca se reescribe.**

---

## 2026-11-16 · Claude

**Tareas:** ninguna empezada. Se escribió el SDD (specs 001 a 003, funcional, técnico, tasks).

**Qué se midió**
- En la PC del taller, `storage/models` tiene 104 carpetas: 806 MB de archivos 3D y 7,5 MB de
  miniaturas. El más grande pesa 229 MB.
- En la nube hay 160 piezas: 91 tienen carpeta en la PC y 69 no (son las creadas sin archivo para
  mapear variantes; 63 las usa el ERP). Hay 13 carpetas cuyo id no está en la nube.
- El bucket privado `archivos-3d` está vacío y admite 500 MB por archivo. El público `modelos-3d`
  tiene 44 archivos.
- De 171 productos, 116 tienen pieza. De los 55 sin pieza, sólo 4 están activos y salieron del botón
  "Nuevo producto".

**Para el que sigue**
- Las ids de las carpetas se compararon contra `public.bodega_models`. No se pudo leer la SQLite
  local (no hay Python y better-sqlite3 está compilado para Electron; ver la memoria de crear piezas
  sin archivo para correrlo con `ELECTRON_RUN_AS_NODE`). El script de migración tiene que leer de ahí
  el nombre del archivo vigente de cada pieza.

## 2026-11-16 · Claude (más tarde)

**Decisiones de Agustín:** las 13 carpetas sin pieza quedan afuera; los 44 archivos del bucket
público pasan al privado; Taiel tiene la Bodega y su usuario. Pidió además crear el producto con
sus variantes, cada una con su modelo, y los insumos (fundas) con el suyo.

**Lo que se midió para diseñarlo** (leyendo los 3MF de la PC con `unzip -p`, sin tocarlos)
- Hay 103 3MF y 1 STL. 87 de los 103 tienen varias placas; `Jabonera.3mf` tiene 17, una por
  diseño, todas sin nombre.
- **Ninguno está laminado**: `slice_info.config` tiene sólo el encabezado. Leer gramos y tiempo del
  archivo sirve sólo si se guarda el proyecto después de laminar; si no, se cargan a mano.
- Las placas no siempre son variantes (las katanas van partidas en placas), así que nunca se
  convierten en opciones solas.

**Cambio de diseño:** un archivo puede ser de varias piezas (colores, placas). El enganche pasó de
una columna única en `archivos_3d` a la tabla `piezas_archivo` (pieza → archivo + placa).

**Para el que sigue**
- Recorrer los 3MF con `for f in $(find …)` se rompe con los nombres con espacios (contó 44 en vez
  de 103): usar `find -print0` con `while read -d ''`.

## 2026-11-16 · Claude (etapa 1)

**Tareas:** TASK-001, 002 y 005 (completed); TASK-003 (blocked por 2 archivos); TASK-004 (in-review).

**Qué se hizo**
- `piezas_archivo` y columnas `hash`, `placas`, `actualizado_en` en `archivos_3d`
  (`prisma/sql/archivos-de-piezas.sql`, aplicado).
- `lib/leer-3mf.ts` con el fflate de three: placas, miniaturas, gramos y tiempo por placa. 18 pruebas.
- `scripts/sdd-014-migrar-archivos.ts`: 89 de 91 piezas subidas y enganchadas; del bucket público,
  44 copiados (14 eran repetidos de otros), verificados por sha256 y tamaño. Con el OK de Agustín se
  borraron los 44 originales y `modelos-3d` pasó a privado.
- En la página del producto, cada pieza muestra su archivo (`components/producto/archivo-de-pieza.tsx`);
  "Fotos y archivo" ya no sube al bucket público. `subirArchivo` calcula el sha256 y no sube dos
  veces lo mismo, y de un 3MF guarda las placas.
- Carpetas de la biblioteca: "Modelos" y "Sin usar" (a Agustín no le gustaron los nombres técnicos).

**Problemas y cómo se resolvieron**
- Los 2 archivos de más de 50 MB fallan con "The object exceeded the maximum allowed size": manda el
  límite global del proyecto, no el del bucket (500 MB). Queda bloqueado hasta que Agustín lo suba.
- Agustín pausó la subida a mitad: se mataron los procesos de node a mano (`TaskStop` no alcanzaba
  al hijo de tsx). La segunda corrida retomó sin repetir nada.
- Aplicar a la receta los gramos y el tiempo leídos **no** se hizo: la receta la escribe la Bodega
  (`bodega.models`), y si el ERP la cambia, la Bodega la pisa en su próxima edición. Va con la etapa 3.
