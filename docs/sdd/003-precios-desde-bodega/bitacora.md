---
feature: 003-precios-desde-bodega
---

# Bitácora · Precios desde Bodega

Diario de sesiones. **Solo se agrega al final, nunca se reescribe.** Es lo primero que lee
el próximo agente o developer antes de seguir: acá queda lo que no entra en el código ni en
el SDD (qué se intentó, qué falló, cómo se resolvió, qué quedó a medias).

Si un problema puede volver a pasar en **otra** feature, además de anotarlo acá se lleva a
`01 - Inventario/INV - Bugs y fixes.md`.

---

## 2026-10-20 · Claude (sesión del inventario) — análisis y SDD

**Tareas:** ninguna empezada; el SDD espera la validación de Agustín.

**Qué se hizo**
- Pedido de Agustín: "Calcular costos en la bodega, guardar los 3 precios en cada modelo, que el
  ERP consuma los 2 precios y modifique los precios de la web y en Mercado Libre".
- Leído: la fórmula de precios de Bodega (`precios.ts`), la calculadora, la sincronización, las
  vistas `public.bodega_*`, el costeo del ERP y la estructura de precios del Shop (base + extras +
  16 reglas condicionales + precio de oferta).
- Cuatro decisiones de Agustín (en el chat): el ERP calcula cada combinación; se aplica con
  aprobación; el precio de venta del ERP = personalizados; materiales primero.

**Hallazgos**
- La ficha del modelo en Bodega todavía muestra el precio de ML viejo (costo × 1,8).
- La regla condicional del Shop **reemplaza** el extra de la opción, no lo suma (SS-00136:
  23.000 + 10.000 + 20.000).
- La documentación de ML dice que desde el 2026-03-18 un `PUT /items` que sólo cambia el precio
  se rechaza; la página oficial responde 403 a la lectura automática y no se pudo confirmar. Va
  como primera parte de TASK-012.
- El llavero Ballena del Shop tiene base $100 y el precio real en los extras del pack: la
  traducción del Shop (spec 006) lo va a reordenar.

**Para el que sigue**
- No se toca código hasta que Agustín valide.
- La web depende de la siembra del Shop del SDD 001, que espera sus respuestas sobre el catálogo.

## 2026-10-20 · Claude (sesión del inventario) — la parte de Bodega

**Tareas:** TASK-001 a TASK-004 (pending → completed). TASK-005 (release) espera el pedido de
Agustín. Nada commiteado.

**Qué se hizo**
- Agustín validó sólo la parte de Bodega ("empezá con los cambios a la bodega, más adelante
  seguimos con lo demás"). Las specs 001 y 002 quedan `validated`; el resto del SDD, `draft`.
- Base del ERP: `prisma/sql/bodega-materiales-y-precios.sql`, aplicado. Copia el esquema de
  `bodega.models`: RLS con `bodega.is_allowed()`, trigger `touch_updated_at`, vistas con
  `security_invoker`. Las tablas del ERP de la feature (`precio_publicado`, `cambios_precio`)
  quedan para cuando se haga esa parte.
- Bodega: tabla `materials` con la migración del día cero (un "Filamento" con el
  `calc_precioKg` de hoy, $18.000); columnas de política y foto en `models`; IPC `materials:*`,
  `models:savePricing`, `models:setMaterial`; `lib/politica.ts` (política efectiva, material,
  tres precios redondeados como la calculadora); sección "Materiales y precio por kilo" en
  Configuración; la calculadora y la ficha con material y política; la sincronización sube
  materiales, política, foto y gastos de venta.

**Cómo se probó**
- `tsc` sin errores nuevos (quedan los de antes: `ipc.ts:71` y el WIP `malla3d.ts` de Agustín) y
  `electron-vite build` completo.
- El proceso principal **real** (ipc, sync, db) empaquetado con esbuild, corriendo con el Node de
  Electron sobre una **copia** de la base de Bodega de esta PC, con `electron` como stub y `fetch`
  falso: migración, materiales, política, foto y lo que se subiría a Supabase. 17 de 17.
- Las filas tal como las manda Bodega, por las vistas de la base real, dentro de una
  transacción deshecha. El orden con el material por defecto al final pasa; el contrario falla
  con `unique_violation` (por eso se ordena).
- Las pantallas, con el renderer en Vite y un `window.api` falso: Configuración (agregar,
  cambiar precio, por defecto, no poder desactivar el por defecto), la calculadora con un modelo
  (material, insumos guardados, margen y redondeo propios, "usar los generales", lo que guarda)
  y la ficha (los mismos tres precios, cambiar material, la foto tachada si cambió).

**Problemas y cómo se resolvieron**
- *Supabase le dio todos los permisos a `anon` en la vista nueva* (default privileges de
  `public`). No daba acceso (la vista corre con el usuario que la llama y `anon` no tiene permiso
  sobre la tabla), pero se revocó para que quede igual a las otras.
- *La calculadora no cargaba los insumos guardados* al abrir un modelo: volver a guardarlo los
  dejaba en cero. Ahora los carga.
- *Pasar de un modelo a la calculadora sola* mantenía el modelo anterior en pantalla (ya pasaba
  con el encabezado). Ahora se limpia.
- *Dos secciones "Materiales" en Configuración*: ya había una lista de texto de la app original
  (`settings.materials`) que nada usa. La nueva se llama "Materiales y precio por kilo"; la vieja
  no se tocó.
- *El margen general y el del modelo se pisaban*: con un modelo abierto, lo que se toca es del
  modelo y "Guardar" de la configuración sigue guardando lo general.

**Para el que sigue**
- Antes de instalar la 2.34 en otra PC no hace falta nada más: el SQL ya está aplicado.
- Hasta TASK-006 el ERP costea todo con el precio del material por defecto (`calc_precioKg`):
  un modelo con otro material da distinto en Bodega y en el ERP.
- La release (TASK-005) sigue el procedimiento de la memoria: el WIP de Agustín (three.js y
  `malla3d.ts`) no entra.

## 2026-10-20 · Claude (sesión del inventario) — release de Bodega 2.34.0

**Tareas:** TASK-005 (pending → completed).

**Qué se hizo**
- Con el pedido de Agustín ("si dale la realese"): commit `c388a23` (la feature), stash del WIP
  de three.js (`package.json` y `package-lock.json`; `malla3d.ts` quieto), versión 2.34.0,
  `npm run dist`, commit `7eb8a98`, push a `main` y release `v2.34.0` en
  `AgustinJak/bodega-3d-releases` con el `.exe`, el `.blockmap` y `latest.yml`.
- Verificado antes de publicar, leyendo el asar con `@electron/asar` desde un script (nunca
  `asar extract-file`): versión 2.34.0, IPC nuevos, sincronización nueva, pantallas nuevas y nada
  del WIP.
- El `stash pop` esta vez entró limpio (en la 2.33.1 chocó). Verificado que volvieron las dos
  líneas de `package.json` y las 70 del lockfile; la memoria del procedimiento quedó corregida.

**Para el que sigue**
- Falta instalarla en el taller (el repo de releases es privado: se instala a mano).
- `BOD - Changelog` no tenía de la 2.31.0 a la 2.33.1; quedó anotado ahí.
