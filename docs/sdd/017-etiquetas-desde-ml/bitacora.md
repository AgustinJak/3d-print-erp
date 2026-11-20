---
feature: 017-etiquetas-desde-ml
---

# Bitácora · Etiquetas de Mercado Libre desde la Bodega

Diario de sesiones. **Solo se agrega al final, nunca se reescribe.**

---

## 2026-11-20 · Claude (el SDD)

**Pedido de Agustín:** de las mejoras propuestas para Etiquetas, la 1 (bajar las etiquetas de ML sin
el navegador) y la 2 (qué hay que despachar hoy). Aclaró que:
- las etiquetas de la web ya las hace la web;
- las de ML ya traen el troquel con producto y variante (preferencia "Imprimir troquel" de la cuenta, prendida, con ZPL y térmica).

**Qué se hizo**
- Se leyeron `etiquetas.ts` y `Etiquetas.tsx` de la Bodega, `resolverFechasEnvio` del ERP y el middleware.
- La Bodega nunca llamó al ERP por HTTP, y el middleware manda a /login lo que no trae cookie: hace falta un bypass con Bearer.
- Sobre ML, la documentación de `shipment_labels` es vieja o se contradice:
  - `zpl2` devolvería un ZIP con un .txt;
  - una fuente de la comunidad dice que bajarla pasa a `printed` y que las Flex no tienen guía.
  - Por eso la TASK-001 es una prueba con un envío real antes de construir.

**Para el que sigue**
- No arrancar la TASK-002 sin el resultado de la TASK-001 y la validación de Agustín.

## 2026-11-20 · Claude (validación)

Agustín validó:
- **sólo la cuenta Sendero 3D**;
- "Imprimir las de hoy" imprime las de hoy y **avisa las de mañana** si ya están listas;
- la prueba de la TASK-001 se hace con **el próximo envío que haya que despachar**.

## 2026-11-20 · Claude (la lista)

**Tareas:** TASK-002 y TASK-003 completas; TASK-005, la parte de la lista.

**Qué se hizo**
- ERP: `getTenantDeBodega`, el bypass del middleware para las dos rutas, `lib/envios-para-despachar.ts` y `GET /api/bodega/envios`.
- Bodega 2.41: `etiquetas-erp.ts` (`labels:envios`), `components/ParaDespachar.tsx` arriba de Etiquetas. Los archivos pasan a llamarse "Archivos en Descargas".
- Primera lectura real: 12 envíos (5 Flex), 1 para imprimir, 9 impresas y 2 a pedido. Hubo un despacho del 19/11 impreso y sin despachar, que sale como atrasado.

**Para la TASK-001**
- Las Flex sí tienen etiqueta en ML: aparecen `printed` las impresas desde la web. Falta ver si `shipment_labels` las devuelve.
- `envioYaSalio` quedó exportado desde `mercadolibre-sync.ts`.
- El caso con token válido de punta a punta se prueba con la Bodega 2.41 instalada. No se usa el refresh token de la PC en un script porque Supabase lo rota y se cortaría la sesión de la Bodega.
