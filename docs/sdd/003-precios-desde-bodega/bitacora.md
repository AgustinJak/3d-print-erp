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

## 2026-10-24 · Claude (sesión del inventario) — los tres precios en el ERP

**Tareas:**

- Completadas: TASK-007, TASK-008, TASK-009, TASK-010 y TASK-012 (de pending).
- TASK-011 pasa de pending a in-progress.
- TASK-016 es nueva y queda blocked.

Antes, con la validación de Agustín (specs 003 a 006, funcional y técnico), TASK-006 quedó
completada: la absorbió la TASK-007 del SDD 004.

**Qué se hizo**

- **Fórmula (TASK-007).** `src/lib/precios-bodega.ts` es la copia de la fórmula de Bodega 2.35.0.
  La arma `scripts/sdd-003-copiar-formula.ts` y no se edita a mano.
  - `scripts/sdd-003-comparar-formula.ts` la corre contra los originales: da igual en 63.110 casos.
  - Para probar que la comparación detecta diferencias, se rompió la copia a propósito cuatro
    veces (redondeo, tolerancia, cuotas, piso mayorista). Las cuatro dieron error.
- **Precio de cada combinación (TASK-008).** Está en `src/lib/precios-combinacion.ts`.
  `sdd-003-probar-precios.ts` da 40 de 40.
  - Las 3 piezas a las que Bodega les guardó la foto de precios (kunai, Soporte Angel, vaso
    Milkshake) dan los mismos tres números que la calculadora (CA-1).
  - De 164 combinaciones activas, 48 tienen precio.
- **Leer ML (TASK-009).** El SQL de `precios-por-canal.sql` quedó aplicado en producción. El ERP
  lee `/items`, `/prices` y `/sale_price` y guarda lo leído en el mapeo, con un solo `UPDATE` al
  final.
- **Pantalla Precios (TASK-010).** `/precios` tiene las pestañas Combinaciones, Mercado Libre,
  Web, ERP e Historial. Además:
  - La página de cada producto muestra los tres precios por combinación y enlaza a la pantalla
    (spec 004, REQ-6).
  - `sdd-003-probar-pantalla.ts` da 30 de 30, en un tenant aislado.
  - Se miró con datos reales en una vista previa temporal, ya borrada, y `next build` pasa.
- **ML (TASK-012).** El cambio del 18/3 sólo afecta a las publicaciones con automatización de
  precios, y la cuenta no tiene ninguna. Ninguna publicación mapeada tiene variaciones.
  - Escritura real en MLA2765577304 (Shinobu 65 Con Funda, pausada): de $43.000 a $32.541 por el
    aplicar del ERP, y vuelta a $43.000. Quedó como estaba, salvo el vencimiento, que ML renovó solo.
- **Para el Shop (TASK-011).** El texto para pegar está en `para-el-shop.md`.

**Problemas y cómo se resolvieron**

- *La lectura de ML tardaba 110 s*: eran cien `UPDATE` de a uno. Pasó a uno solo y bajó a 20 s.
- *`/items` devuelve el precio de la promoción como `price`* en 3 publicaciones. El precio se lee
  de `/prices`, del tipo standard.
- *Un mapeo apuntaba a una combinación desactivada* y rompía el cálculo. Ahora esa fila dice "la
  combinación está desactivada".
- *`bodega_model_id` es único*, así que la prueba de la pantalla no podía reusar piezas de verdad.
  Usa tres piezas "ZZ Prueba Claude" con la receta copiada, y las borra al final.
- *CA-4 de la spec 005.* El ERP manda sólo `{ price }`, pero ML recalculó el envío gratis
  obligatorio: lo sacó a $32.541 y lo puso de nuevo a $43.000. Ahora se informa aparte
  (`envioGratis`) y no cuenta como otro campo tocado.

**Para Agustín: lo que hay que mirar antes de aplicar**

- *Diferencias grandes en ML.* 45 publicaciones tienen otro precio propuesto, y 21 cambian más de
  30 %. Las más fuertes:

  | Producto | Publicado | Propuesto |
  |---|---|---|
  | Caja Figuritas | $17.900 | $110.962 |
  | Ajedrez | $40.000 | $83.835 |
  | Tateti | $24.000 | $57.448 |
  | Porta Auricular de Demonio | $29.990 | $69.779 |

  Puede que esas recetas de Bodega tengan los gramos y el tiempo de una cama entera y no de una
  pieza. Conviene revisarlas en Bodega antes de aplicar.
- *Insumos de las katanas en Bodega.* Sanemi, Shinobu y Zenitsu de 65 tienen $2.788 de insumos, y
  Sanemi 95 tiene $5.349. Si eso es la funda, la "Con Funda" la cuenta dos veces, porque ahora la
  suma la receta.
- *Envío gratis de la web desde $0 en Bodega.* Por eso en lo barato la web sale más cara que ML
  (Minikatana: ML $7.890, web $11.790).
- *Promo de ML.* Bodega infla para una promo de 18,9 %, pero las campañas de hoy son de 5 % y 10 %.
- *Umbral del envío gratis de ML.* A $32.541 ML ya no lo hacía obligatorio. Bodega usa $30.000.
- *Fundas sin receta en Bodega.* Funda blanca 95, Kitetsu 95, Shanks 95 y Tengen 95. Por eso
  sus 5 "Con Funda" no tienen precio.
- *Campañas.* 83 de las 100 publicaciones de ML están en campaña y no se tocan hasta la TASK-016,
  que necesita que Agustín elija una publicación para probar.

**Para el que sigue**

- Nada de esto está commiteado ni desplegado: hay que esperar el pedido de Agustín. El SQL ya está
  en producción y el código desplegado no lo lee.
- La web espera el endpoint del Shop: TASK-011 y después TASK-013.
- El cerebro sigue frenado ("por ahora no toques el cerebro"). Cuando se destrabe, TASK-015 tiene
  que sumar a `INV - Flujos` la página `/precios` y los cuatro endpoints.
