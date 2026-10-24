---
id: 004-pantalla-de-precios
feature: 003-precios-desde-bodega
titulo: Una pantalla del ERP muestra qué precio cambiaría en cada canal y lo aplica sólo con aprobación
estado: draft
actualizado: 2026-10-20
---

# Pantalla de Precios

## Contexto
Agustín decidió (2026-10-20) que ningún precio salga solo: el ERP propone y él aprueba. Hoy cada
precio se copia a mano de la calculadora al Shop y a cada publicación de ML, y no queda registro
de qué se cambió ni cuándo.

## Requisitos
- **REQ-1** — Debe haber una pantalla **Precios** en el ERP con, por cada combinación, su costo y
  sus tres precios propuestos (spec 003), y la foto de Bodega al lado (spec 002).
- **REQ-2** — Por cada clave de canal mapeada a esa combinación (SDD 001), la pantalla debe mostrar
  el precio publicado hoy y el propuesto, con la diferencia en pesos y en %.
- **REQ-3** — Debe permitir aplicar los cambios por fila, por selección o todos los de un canal
  (ML, web o ERP), y nunca sin un click de confirmación que diga cuántos precios cambian.
- **REQ-4** — Cada precio aplicado debe quedar en un historial: canal, clave, antes, después,
  quién, cuándo y qué respondió el canal.
- **REQ-5** — Debe poder filtrar: con diferencias, por canal, "falta costear" y "falta mapear".

## Reglas de negocio
- **RN-1** — "Con diferencia" = el propuesto y el publicado difieren en más de $1. El redondeo ya
  está aplicado en el propuesto.
- **RN-2** — El precio publicado se lee del canal en el momento ("Leer precios actuales"): ML con
  `GET /items` (sólo lectura) y la web con la simulación del Shop (spec 006). Una lectura vieja
  (más de una hora) se marca y no se puede aplicar sin releer.
- **RN-3** — Lo que no se puede aplicar se muestra con el motivo y no se manda: falta costear, falta
  mapear, publicación pausada o cerrada, automatización de precios de ML activa, variaciones con
  precios distintos (spec 005), combinación que el Shop no puede representar (spec 006).
- **RN-4** — Una suba o baja de más del 30 % se marca en rojo y pide una confirmación aparte.
- **RN-5** — El canal "ERP" es el precio de venta del modelo y el adicional de sus variantes
  (spec 003, RN-4). Se aplica igual que los otros, con historial.

## Criterios de aceptación
- [ ] **CA-1** — Dado "Tanjiro 95 · Con Funda" mapeada a una publicación de ML a $59.990 y con
  precio propuesto $64.990, cuando se abre la pantalla, entonces la fila muestra $59.990 → $64.990
  (+8,3 %).
- [ ] **CA-2** — Cuando se aplica esa fila, entonces la publicación queda a $64.990 y el historial
  tiene el cambio con la respuesta de ML.
- [ ] **CA-3** — Dada una combinación con "falta costear", entonces no tiene botón de aplicar y dice
  qué falta.
- [ ] **CA-4** — Dado un cambio de +40 %, entonces se ve en rojo y aplicarlo pide confirmarlo aparte.

## Casos borde
- Dos claves de ML a la misma combinación (dos publicaciones de lo mismo): las dos filas reciben el
  mismo precio.
- Un error del canal en medio de un "aplicar todos": lo aplicado queda aplicado, el resto se
  informa fila por fila y se puede reintentar.
- Doble click en aplicar: el segundo no manda nada si el precio publicado ya es el propuesto.

## Fuera de alcance
- Aplicar precios solo, por un cron o al guardar en Bodega (decisión del 2026-10-20).
- Editar a mano un precio propuesto en esta pantalla: el precio se decide en Bodega.

## Preguntas abiertas
Ninguna.

## Referencias
- SDD 001: `mapeos_canal` y la pestaña Integraciones › Mapeo.
- `inventario_sendero3d/src/app/(app)/integraciones/mapeo-canales.tsx` (patrón de la pantalla).
