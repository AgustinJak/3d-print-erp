---
id: 003-cambios-en-bodega
feature: 014-modelos-en-el-erp
titulo: La Bodega baja las piezas y sus archivos del ERP y deja de crearlas
estado: validated
actualizado: 2026-11-16
---

# Cambios en la Bodega

Este cambio es de la Bodega (`Bodega/Bodega3D-App`). Se escribe acá porque nace del SDD 014 del
ERP; lo implementa la sesión dueña de la Bodega y sale en una versión nueva (hoy 2.36.0).

## Contexto
La Bodega crea las piezas y es la única dueña de los archivos. La sincronización sube las piezas y
nunca crea una que baja de la nube (`src/main/sync.ts:373`). Para que Taiel trabaje desde su PC,
eso se da vuelta.

## Requisitos
- **REQ-1** — La Bodega crea en su base local las piezas que existen en la nube y no tiene.
- **REQ-2** — La Bodega baja el archivo de una pieza cuando se abre, se encola o se pide, y lo guarda
  en una caché local.
- **REQ-3** — Un archivo ya bajado se usa sin internet.
- **REQ-4** — Si el archivo de la nube cambió, la Bodega baja el nuevo antes de usarlo.
- **REQ-5** — "Abrir en Bambu Studio" abre el archivo bajado con el programa del sistema.
- **REQ-5b** — Si la pieza es una placa de un archivo compartido, la ficha y la cola dicen cuál
  ("Placa 7 · Duna"), porque Bambu Studio abre el proyecto entero.
- **REQ-5c** — Las piezas que comparten archivo lo bajan una sola vez.
- **REQ-6** — "Nuevo modelo" en la Bodega deja de existir y avisa que las piezas se crean en el ERP,
  con un botón para abrirlo.
- **REQ-7** — La Bodega deja de subir los datos de la receta (nombre, gramos, tiempo, material,
  insumos); sigue subiendo la cola y lo que le toque del stock.
- **REQ-8** — La pantalla de configuración muestra cuánto ocupa la caché y permite vaciarla.

## Reglas de negocio
- **RN-1** — La descarga usa la sesión de la Bodega: el usuario tiene que haber iniciado sesión.
- **RN-2** — Se compara por el tamaño y la fecha del archivo en la nube para saber si cambió.
- **RN-3** — La caché vive en `storage/models/<id>/`, la misma carpeta de hoy, así los 91 archivos
  ya presentes en la PC del taller cuentan como bajados y no se descargan de nuevo.
- **RN-4** — Las piezas borradas en el ERP se ocultan en la Bodega; su carpeta no se borra sola.

## Criterios de aceptación
- [ ] **CA-1** — Dada una Bodega nueva en otra PC con sesión iniciada, cuando sincroniza, entonces ve
  las 160 piezas.
- [ ] **CA-2** — Dada una pieza con archivo en la nube, cuando la abro en Bambu Studio, entonces la
  baja (con progreso) y se abre.
- [ ] **CA-3** — Dado un archivo ya bajado y sin internet, cuando lo abro, entonces se abre igual.
- [ ] **CA-4** — Dado que en el ERP se reemplazó el archivo, cuando lo abro en la Bodega, entonces
  baja el nuevo.
- [ ] **CA-5** — Dado que cambio los gramos de una pieza en el ERP, cuando la Bodega sincroniza,
  entonces no los pisa con los suyos.
- [ ] **CA-6** — En la PC del taller, después de actualizar, no se descarga ninguno de los 91
  archivos que ya estaban.

## Casos borde
- Sin internet y sin el archivo bajado: se avisa, no se rompe la cola.
- Un archivo de 229 MB: la descarga muestra progreso y se puede cancelar.
- Dos Bodegas a la vez (taller y Taiel): la cola y el stock siguen las reglas actuales de la
  sincronización; las piezas son de sólo lectura en las dos.

## Fuera de alcance
- Mandar a imprimir sin abrir Bambu Studio (ver RN-6 del SDD funcional).
- La web de la Bodega en el celular: no maneja archivos.

## Decisiones
- Taiel tiene la Bodega instalada y su propio usuario del ERP (Agustín, 2026-11-16).

## Preguntas abiertas
- [ ] ¿Se baja todo al iniciar (unos 800 MB) o sólo a pedido? (propuesta: a pedido).

## Referencias
- Bodega: `src/main/sync.ts:16,261-430`, `src/main/storage.ts:68-150`, `src/main/ipc.ts:359,657`,
  `src/main/db.ts:60` (tabla `models`).
- Vault: `03 - Bodega/BOD - Flujos.md` (secciones 3 y 9), `Flujos del ecosistema.md`.
