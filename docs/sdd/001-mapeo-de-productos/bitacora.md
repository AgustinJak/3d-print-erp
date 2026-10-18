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
