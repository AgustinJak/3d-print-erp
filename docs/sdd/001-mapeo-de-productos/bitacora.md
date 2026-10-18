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
