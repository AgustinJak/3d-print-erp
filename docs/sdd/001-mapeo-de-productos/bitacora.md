---
feature: 001-mapeo-de-productos
---

# Bitácora · Mapeo de productos entre sistemas

Diario de sesiones. **Solo se agrega al final, nunca se reescribe.** Es lo primero que lee
el próximo agente o developer antes de seguir: acá queda lo que no entra en el código ni en
el SDD (qué se intentó, qué falló, cómo se resolvió, qué quedó a medias).

Si un problema puede volver a pasar en **otra** feature, además de anotarlo acá se lleva a
`01 - Inventario/INV - Bugs y fixes.md`.

---

## 2026-10-18 · Claude (sesión del inventario) — análisis, fase 0 y SDD

**Tareas:** TASK-001 (completed). El resto en `pending` hasta la validación.

**Qué se hizo**
- Análisis medido contra las bases del ERP y del Shop y el código de los tres sistemas. Quedó en
  el cerebro: `Mapeo de productos`. Lo central: lo vendible no existe como cosa; 89 de 92 modelos
  activos tienen una sola fila de stock; 21 de 50 SKUs del Shop no están en el ERP; seis formas
  distintas de `variantesInfo`.
- Decisiones de Agustín (en el chat): SKU de la combinación = SKU del modelo + sufijo; el mapeo
  de cada canal vive en el ERP; la fase 0 se hace ya.
- **Fase 0** (sin commitear al cerrar esta entrada):
  - `normalizeVariante` (`src/lib/mercadolibre-sync.ts:10`) borraba las "s" en vez de los
    espacios. Simulado con los 23 pares reales de ML: mismo resultado en todos, y "95 cm" ahora
    matchea "95cm".
  - `src/lib/variantes-item.ts`: el diálogo de edición conserva `varianteId` y `matched`.
    Probado contra las 1.019 líneas reales: guardar sin tocar no cambia lo que lee el reparto en
    ninguna.
- Carpeta `docs/sdd/` del inventario creada con las plantillas de Bodega adaptadas, y este SDD.

**Problemas y cómo se resolvieron**
- *La spec 001 tenía ejemplos inventados.* La "Tanjiro Katana 95cm" con SKU es la vieja
  (`SS-DEM-KAT-006-95`); las dos "nuevas" no tienen SKU. Y la Bola de JOJOS sí tiene variantes.
  Se corrigieron contra la base. Los ejemplos de una spec salen de la base, no de la memoria.
- *¿El Shop guarda ids de sus opciones?* Sí: los 48 pedidos con opciones los tienen todos. Eso
  permitió sembrar el mapeo del Shop desde su catálogo y dejar la clave transitoria sólo como
  respaldo.

**Para el que sigue**
- No se valida hasta responder la pregunta abierta de la spec 004 (los diseños y firmas del Shop).
- `GET /items/{MLA}` es sólo lectura: la regla de no modificar publicaciones de ML sigue.
- La siembra del Shop necesita el catálogo exportado: el ERP no tiene credenciales de la base del
  Shop. Se exporta con SQL de sólo lectura y se le pasa al script.

## 2026-10-18 · Claude (sesión del inventario) — respuestas de Agustín y spec 006

**Qué cambió**
- Pregunta abierta respondida: el vaso BTS y el llavero BT21 comparten una fila de stock entre
  todas sus variantes; la jabonera tiene una pieza por diseño; el exhibidor de la Kitetsu es un
  insumo. Quedó en la spec 004, RN-8.
- Spec 006 nueva: recetas desde el ERP. Agustín contó que crear una katana le pedía mapear la
  funda con ayuda: `reglas_insumo` nunca tuvo pantalla. Tareas TASK-020 a TASK-022.
- Feature 002 pedida: llevar la disponibilidad a la web ("disponible X días después de la
  compra") y a ML (sacar Flex y sumar 2 días) cuando el ERP se queda sin stock. Va después de
  esta. El Shop ya tiene `stock_tipo` y `tiempo_produccion` por producto; en ML choca con la
  decisión de sólo lectura (`INV - Decisiones`, que habla de títulos y descripciones): necesita
  su propia decisión.

**Problemas y cómo se resolvieron**
- *La spec 006 decía "7 fundas".* Son 10 según la base; el número venía de una nota de agosto.

## 2026-10-18 · Claude (sesión del inventario) — primera mitad: combinaciones, recetas, reparto y diálogo

**Tareas:** TASK-002 a TASK-009, TASK-020 y TASK-021 (pending → completed). Rama
`feat/001-mapeo-de-productos`, commits `3df17f7`, `c9d6b57`, `a74802f`. Sin desplegar.

**Qué se hizo**
- Tablas `combinaciones` y `mapeos_canal`, y `items_pedido.combinacion_id` / `clave_canal`,
  aplicadas en producción (aditivo).
- Siembra: 137 combinaciones, 118 con SKU. Backfill: 1.007 de 1.008 líneas con combinación, 87
  combinaciones históricas. Ningún número cambió.
- Modo sombra en cero (32 de 32 líneas abiertas) y el reparto pasó a leer la combinación (`auto`).
  Comparado contra el reparto real: mismas 31 reservas y mismo "Faltan".
- Recetas desde el modelo: "Agregar accesorio" y el selector de insumo. Probado con escritura en
  un tenant aislado.
- El diálogo de pedido elige una combinación; la API la valida contra el tenant.

**Problemas y cómo se resolvieron**
- *Una katana de ML vendida sin decir si llevaba funda* (Sanemi 95, pedido abierto) no tenía
  combinación: la siembra crea una por variante, no "el modelo solo" cuando hay variantes. El
  backfill la crea como registro, **desactivada**: de acá en adelante cada venta tiene que decir
  con o sin. Esa publicación es justo lo que va a mostrar la cola de mapeo.
- *La siembra y el backfill desde la PC tardan minutos*: cada combinación son varias consultas en
  serie contra us-east-2. Desde Vercel (mismo datacenter) es otra cosa. Para una vez, no vale
  optimizarlo.
- *esbuild no sirve para correr `reservas.ts`*: empaqueta el cliente de Prisma y se rompe la
  búsqueda del motor. Los scripts del SDD van con `npx tsx --env-file=.env`, que respeta los alias.
- *El bloque de variantes del diálogo no se pudo reemplazar con Edit*: el original tiene `"✓"`
  escrito así en el código. Se reemplazó por rango de líneas con un script.
- *Las 10 fundas tienen stock 0 y 8 no tienen costo de Bodega*. No es un bug: falta el conteo
  físico y la receta de Bodega de esas piezas. Sin costo, guardar la receta no toca el adicional.

**Para el que sigue**
- Las pantallas (modelo y diálogo) no se vieron en el navegador: piden sesión. Verificar con
  Agustín.
- Falta la mitad de los canales: TASK-010 a TASK-019 y TASK-022.

## 2026-10-18 · Claude (sesión del inventario) — deploy de la primera mitad y un hueco que dejó

**Qué pasó**
- Desplegado a producción (`60980f6`), con aprobación de Agustín.
- Mirando el formulario de edición de un modelo, apareció un hueco: **un modelo creado después del
  deploy no recibía combinación** (ni desde el formulario ni desde el alta automática de Bodega),
  así que no se podía elegir en el diálogo de pedido, que ahora sólo lista combinaciones. Y borrar
  o renombrar una variante dejaba combinaciones y recetas apuntando a un id que ya no existe.

**Cómo se resolvió**
- `sembrarCombinacionesDeModelo` en el alta (`POST /api/modelos`, `altas-bodega.ts`) y en la
  edición (`PUT /api/modelos/[id]`); `soltarVariantesBorradas` desactiva las combinaciones de una
  variante borrada y borra sus recetas. Sin variantes, "el modelo solo" se reactiva.
- Probado en un tenant aislado (`scripts/sdd-001-probar-modelos.ts`, 9 de 9). En producción no
  llegó a crearse ningún modelo sin combinación entre el deploy y el arreglo.

**Para el que sigue**
- El formulario de edición sigue dejando cargar a mano el "+$ costo" de "Con Funda". Si la funda
  tiene costo de Bodega, guardar la receta lo pisa con el costo real (spec 006, RN-4).

## 2026-10-19 · Claude (sesión del inventario) — segunda mitad: el mapeo por canal

**Tareas:** TASK-010, 011, 012, 014, 015 y 017 (pending → completed); TASK-016 en curso. Sin
commitear ni desplegar al cerrar esta entrada.

**Qué se hizo**
- `src/lib/mapeo-canal.ts`: claves, unidades, `resolverLinea` (mapeo primero; si no, la lógica
  de antes propone y lo que propone sin dudas queda mapeado solo), `lineaDeCombinacion`,
  `completarLineasDeClave` y `mapearClave`.
- ML: `deducirPorPublicacion` y `resolverItemsMl` salieron de `processMlOrderGroup`. La siembra
  (`src/lib/mapeo-ml.ts`) lee cada publicación con `GET /items/{MLA}`, sólo lectura.
- Shop: el webhook resuelve cada línea por el mapeo y acepta `producto_id`, `grupo_id` y
  `opcion_id` opcionales (spec 005, que todavía no manda nadie).
- Integraciones › Mapeo: la cola y todas las claves, con buscador de combinaciones, unidades y
  "Otro negocio". Al mapear, las líneas abiertas que esperaban la clave se completan y se
  reparte.
- Prueba de punta a punta (`scripts/sdd-001-probar-mapeo.ts`): 26 de 26. Las de la primera
  mitad siguen bien (recetas, modelos, y el reparto en sombra: 42 iguales, 0 distintas).
- **Siembra de ML real**, en producción: 113 publicaciones, 115 claves; 73 resueltas solas, 15 de
  otro negocio, 27 en la cola. Creó dos combinaciones nuevas (Lostvayne 65cm · verde y · Azul
  acero, sin SKU porque el modelo no tiene). Ninguna línea de pedido cambió: el código
  desplegado todavía no lee `mapeos_canal`.

**Problemas y cómo se resolvieron**
- *La siembra iba a crear "el modelo solo" activo para las katanas sin funda configurada.* La
  primera simulación mostró 9 "combinaciones nuevas" que eran eso. Regla nueva (`esAmbigua`):
  "el modelo solo" de un modelo con variantes nunca resuelve, va a la cola. Y cuando un modelo
  pasa a tener variantes, su combinación sin variantes se desactiva
  (`sembrarCombinacionesDeModelo`), para que los mapeos que apuntaban ahí vuelvan a resolverse.
- *RN-4 no alcanzaba para ML.* En 180 días hubo 240 líneas con un color que el modelo no tiene,
  todas de modelos sin variantes: son una sola cosa. ML acepta ese caso (salvo atributos que
  parecen cantidades); el Shop no, porque ahí una opción puede ser un pack o un diseño que es
  otra pieza (RN-8). Quedó escrito en la spec 004.
- *La transacción del webhook del Shop pasaba los 5 s de Prisma* en la prueba (desde la PC, con
  la latencia a us-east-2). Con el mapeo adentro, cada línea hace varias consultas. Se subió a
  20 s. Desde Vercel (mismo datacenter) debería sobrar, pero un pedido de varias líneas podía
  cortarse a mitad.
- *La siembra real desde la PC tardó unos 15 minutos* (la simulación, 8). En Vercel el endpoint
  tiene `maxDuration` 300; con la latencia de allá debería entrar en un minuto.
- *Un heredoc de bash convirtió `\b` en un carácter de retroceso* en una regex. Ya estaba
  anotado: los cambios con barras invertidas van con Edit o con un script escrito con Write.
- *El validador de mermaid del scratchpad perdió un archivo de jsdom*; se reinstaló.

**Decisiones tomadas sin preguntar** (chicas, a revisar con Agustín)
- En ML, una publicación **sin modelo** se sigue descartando como antes (su clave queda en la
  cola). Cargarla sin modelo metería en el ERP las ventas de Shay que todavía no estén marcadas.
- Los ids del Shop no se validan como uuid: un id raro da una clave sin mapear y no rechaza el
  pedido.
- Editar una publicación en la pestaña vieja de ML vuelve a resolver sus claves no manuales (una
  lectura de ML por guardado), para que las dos pantallas no se contradigan mientras convivan.

**Para el que sigue**
- La cola de ML tiene 27 claves para mapear a mano desde la pestaña nueva, una vez desplegada.
- La pantalla no se vio en el navegador: pide sesión.
- Falta TASK-022 con Agustín, después TASK-013 (siembra del Shop: exportar su catálogo con SQL
  de sólo lectura) y TASK-019. La clave del Shop por ids sólo sirve cuando el Shop los mande
  (spec 005); mientras tanto entra la transitoria por SKU, así que la siembra del Shop conviene
  después de ese cambio, o sembrando las dos claves.
- `INV - Changelog` no tiene todavía la primera mitad ni esta: se arma con los commits.

## 2026-10-19 · Claude (sesión del inventario) — el Shop ya manda los ids

**Qué pasó**
- El Shop hizo la spec 005 en su `docs/sdd/017` (commit `5050b03`, en producción). Dato nuevo:
  sus ids de opción **no eran estables** hasta ese deploy ("Guardar variantes" recreaba las
  opciones). 32 de 58 opciones de pedidos viejos ya no existen. Se corrigió REQ-7 de la spec 004,
  que daba por buena la clave por ids para el historial.
- El ERP desplegado (sin la spec 004) recibe el payload nuevo sin problema: zod descarta los
  campos que no conoce. SS-00136 entró bien después del deploy del Shop.

**Encontrado de paso**
- Desde el deploy de la primera mitad, los webhooks no completan `combinacion_id` (eso llega con
  esta segunda mitad): 18 líneas con modelo y sin combinación, 17 de pedidos abiertos. Todas
  tienen la variante elegida o un modelo sin variantes: el backfill de combinaciones las completa
  solo. Correrlo después del deploy. El reparto no se vio afectado: cae al JSON.
- Dos líneas "sin modelo" de pedidos abiertos del Shop, entradas con el código viejo y por eso
  sin `clave_canal`: SS-00133 ("Bola De Demolicion, Wrecking Ball…", sin SKU) y SS-00136
  ("Katana de Tanjiro Kamado (Roja)", SKU `SS-DEM-KAT-007`, que no existe en el ERP). Mapear la
  clave no las completa: se corrigen editando el pedido.

**Para el que sigue**
- La siembra del Shop (TASK-013) se hace desde el catálogo de hoy, con la clave por ids.

## 2026-10-20 · Claude (sesión del inventario) — deploy de la segunda mitad

**Qué pasó**
- Con aprobación de Agustín: commits `df1fc56` (código) y `353b23d` (SDD) en master, desplegados
  en Vercel (`iad1`, READY en un minuto). Sin errores de ejecución en la primera hora.
- Backfill de combinaciones (`scripts/sdd-001-backfill.ts`): las 18 líneas que habían entrado
  sin combinación desde el deploy de la primera mitad la tienen; ninguna combinación nueva.
- Reparto en sombra después del backfill: 42 de 42 líneas iguales, 0 distintas.
- Las rutas nuevas responden 307 sin sesión (el middleware las manda al login), como las demás.

**Para el que sigue**
- Verificar el primer pedido del Shop que llegue con ids: tiene que crear una clave
  `<producto_id>|<opcion_ids>` en `mapeos_canal` (TASK-016).
- Las 27 claves de ML de la cola y las dos líneas sin modelo (SS-00133, SS-00136) las resuelve
  Agustín desde la pantalla.
- TASK-018 está a medias: se actualizaron `INV - Flujos`, `Flujos del ecosistema`, `Mapeo de
  productos` e `INV - Changelog`; faltan `INV - Integración Mercado Libre`, `INV - Integración
  Sendero Shop`, `INV - Modelos`, `INV - Decisiones`, `Convención de SKU` y `Stock unificado`.

## 2026-10-23/24 · Claude (sesión del inventario) — catálogo del Shop y su siembra

**Tareas:** TASK-016, TASK-022 y TASK-013 (→ completed).

**Qué pasó**
- TASK-016 verificada con los pedidos SS-00137 a SS-00143: cuatro claves por ids, las cuatro
  resueltas solas.
- Respuestas de Agustín al catálogo (en el chat): la Tanjiro roja es la "nueva"; la Tengen de 65 no
  existe; la Knight Killer no se vende más; el exhibidor de la Kitetsu no se lleva; el SKU cruzado
  del porta bálsamo, "elegí vos"; los cinco productos que faltaban, "crealos". La Caja Guarda del
  Shop ($13.000) se mapeó a la Caja chica, como la "Caja Guarda" sin Premium de ML.
- `scripts/sdd-001-catalogo-shop.ts`, en tres fases:
  - `preparar`: los SKU del porta bálsamo (`SS-K4O-LLA-051`) y del porta latas
    (`SS-K4O-MER-053`), alineados con el Shop, con la combinación de cada uno. En ML ninguna de las
    publicaciones revisadas tiene SKU. Más los cinco modelos nuevos con el SKU del Shop: Hacha
    Prime, Lucero de Alba, Llavero Ballena 52 Hz, Llavero BT21 (8 personajes) y Jabonera
    minimalista (15 diseños), con variantes que afectan stock.
  - `mapear`: los pares que la siembra no deduce sola, como `manual`.
  - `lineas`: las dos líneas viejas sin modelo (SS-00133, la bola de demolición, $2.297; SS-00136,
    Tanjiro nueva 95 con funda, $18.802). Pedidos completados: no se toca el stock.
- Siembra (`sdd-001-sembrar-shop.ts --real`) desde el catálogo exportado con SQL de sólo lectura:
  147 claves, 95 resueltas solas; `mapear` cargó 47 más.
- Agustín cambió el Shop en el medio: borró la Daga Knight Killer, le sacó el grupo Tamaño a la
  Tengen y el Exhibidor a la Kitetsu. Se sembraron las 6 claves nuevas (4 solas, 2 manuales) y se
  borraron de la cola las 4 que ya no pueden llegar (Knight Killer y Tengen 65). Las claves viejas
  ya mapeadas quedan, por si entra un pedido rezagado.
- **Cola del Shop: una sola clave**, la MiniKatana de Tanjiro roja (¿es la "Tanjiro V2 20cm" de
  Bodega? Pregunta abierta).
- Las 26 piezas de los productos nuevos se crearon **en Bodega**, a pedido de Agustín, como las
  "creadas desde el ERP" del 2026-08-28: sin archivo (`filePath` vacío), en su base local con la
  app cerrada y con copia antes. Cada fila de stock del ERP quedó enganchada a su pieza en el mismo
  paso, para que el alta automática no les cree un modelo aparte. Bodega las sube en su próxima
  sincronización; Agustín les carga el `.3mf` con "Agregar archivo 3D".
- Integraciones › SKUs (antes "Mapeo SKUs") ya no lista "SKUs huérfanos": los sacaba de los
  últimos 200 avisos del Shop, que no cambian, así que una venta resuelta seguía apareciendo para
  siempre (la bola de demolición). Lo que no se reconoce está en la cola de Mapeo.

**Encontrado de paso**
- El editor de variantes (el lápiz de /modelos) no tiene cómo marcar que una variante es **otra
  pieza** (`afectaStock`): toda variante nueva nace como accesorio, sin fila de stock propia. Hoy
  sólo se puede por script. Anotado en `INV - Backlog`.

**Para el que sigue**
- TASK-019: con todas las claves de katanas del Shop mapeadas, el parche de tamaño ya se puede
  retirar.
- TASK-018: faltan `INV - Integración Mercado Libre`, `INV - Modelos`, `INV - Decisiones`,
  `Convención de SKU` y `Stock unificado`.

## 2026-10-24 · Claude (sesión del inventario) — la MiniKatana roja y el BT21

**Qué pasó**
- Agustín confirmó que la MiniKatana de Tanjiro roja es "Tanjiro V2 20cm". En el ERP ese modelo
  estaba desactivado y **consolidado** en "Tanjiro MiniKatana" (la negra). Consolidar sólo marca
  (`consolidado_en_id` + inactivo), así que se deshizo: activo, sin consolidar, SKU
  `SS-DEM-MIN-017` (el del Shop), con su combinación. `sdd-001-catalogo-shop.ts preparar` lo deja
  registrado (lista `REACTIVAR`) y `mapear` cargó la última clave. **Colas de ML y del Shop: 0.**
- El 2026-10-18 se había decidido que los personajes del BT21 comparten una fila (spec 004,
  RN-8). Agustín lo cambió el 2026-10-24: son 8 piezas. Quedan como se crearon (8 filas, 8 piezas
  de Bodega). Ver el SDD 004.
