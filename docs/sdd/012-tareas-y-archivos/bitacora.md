# Bitácora — 012: tareas del día y archivos 3D

## 2026-11-16 · Claude

**La base** (`prisma/sql/tareas-y-archivos.sql`, aplicada): `tareas`, `tareas_recurrentes`,
`archivos_3d`, `tarea_archivos`, con RLS prendido y sin políticas (sólo las usa el servidor). Bucket
privado `archivos-3d` de hasta 500 MB por archivo.

**La lógica.** `lib/tareas-reglas.ts` (pura: el día de Argentina, qué recurrente toca, orden entre
tarjetas; 19 pruebas en `scripts/sdd-012-probar-tareas.ts`) y `lib/tareas.ts` (tablero, historial,
recurrentes, biblioteca, links firmados). API en `/api/tareas*` y `/api/archivos*`.

**Las pantallas.** `/tareas`: tablero con alta rápida por columna, arrastrar mueve y ordena en el
acto, editor con responsable, prioridad, fecha, pasos con tildes y archivos adjuntos; historial
por día con rango de fechas; tareas que se repiten (todos los días, algunos días, una vez al mes),
que se pausan. `/archivos`: subir arrastrando (de a dos), carpetas, etiquetas, búsqueda, visor 3D
con three.js (STL, 3MF, OBJ) que guarda la miniatura la primera vez.

**Probado de punta a punta** con una cuenta de prueba, borrada después: crear y mover, Terminadas
sólo de hoy, historial por día, motivo de trabada, la diaria una sola vez, subir con el token
firmado como el navegador, confirmar, listar, bajar con el link, que sin link no se baje, adjuntar
a una tarea y borrar del almacenamiento (15 de 15).

**Sin ver todavía en pantalla:** la sesión del navegador de la sesión no se mantiene.
