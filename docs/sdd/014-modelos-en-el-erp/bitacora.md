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
