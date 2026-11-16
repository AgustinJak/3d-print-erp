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
