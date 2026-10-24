---
id: 004-donde-se-vende
feature: 004-estructura-del-catalogo
titulo: La página del modelo muestra dónde se vende y si cada canal ya lo reconoce
estado: validated
actualizado: 2026-10-24
---

# Dónde se vende

## Contexto
Para saber si un modelo está bien vinculado con Mercado Libre y el Shop hay que ir a
Integraciones y buscarlo. Desde el mapeo por canal (SDD 001) el ERP ya sabe qué publicación y qué
producto del Shop llegan a cada combinación: alcanza con mostrarlo.

## Requisitos
- **REQ-1** — La página debe tener una sección **Dónde se vende**, de sólo lectura.
- **REQ-2** — Debe listar las publicaciones de ML vinculadas al modelo, con su título y su MLA.
- **REQ-3** — Debe listar las claves de cada canal que resuelven a combinaciones del modelo, con lo
  que vendió el canal ("Katana de Tanjiro · 95cm · Con Funda") y la combinación.
- **REQ-4** — Debe avisar si hay claves de la cola que el ERP sugiere para este modelo.
- **REQ-5** — Cada clave debe llevar a Integraciones › Mapeo para cambiarla.

## Reglas de negocio
- **RN-1** — Las claves marcadas como otro negocio no se muestran.

## Criterios de aceptación
- [ ] **CA-1** — Dada la Tengen Uzui, entonces se ven sus publicaciones de ML y las dos claves del
  Shop (con y sin funda).
- [ ] **CA-2** — Dado un modelo sin publicaciones ni claves, entonces la sección dice "Todavía no se
  vendió por ningún canal".

## Casos borde
- Una clave que apunta a una combinación desactivada: se muestra en gris, con "se va a volver a
  resolver en la próxima venta".

## Fuera de alcance
- Editar el mapeo desde acá: se hace en Integraciones › Mapeo.
- Precios por canal: SDD 003.

## Preguntas abiertas
Ninguna.

## Referencias
- `src/lib/mapeo-canal.ts`, `src/app/api/integraciones/mapeos/route.ts`.
- Tabla `publicaciones_ml` (`modelo_id`).
