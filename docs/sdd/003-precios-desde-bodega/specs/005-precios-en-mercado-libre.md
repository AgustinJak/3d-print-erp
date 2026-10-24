---
id: 005-precios-en-mercado-libre
feature: 003-precios-desde-bodega
titulo: El ERP cambia el precio de una publicación de Mercado Libre, sólo el precio y sólo con aprobación
estado: validated
actualizado: 2026-10-24
---

# Precios en Mercado Libre

## Contexto
Hasta acá la integración con ML fue de sólo lectura: nunca se modificó una publicación
(`INV - Decisiones`). Esta spec abre **una** escritura, el precio, porque Agustín lo pidió el
2026-10-20 para controlar los precios desde Bodega. Título, descripción, fotos, stock y el resto
siguen sin tocarse.

## Requisitos
- **REQ-1** — El ERP debe leer el precio publicado de cada publicación mapeada (`GET /items/{MLA}`).
- **REQ-2** — El ERP debe poder cambiar el precio de una publicación desde la pantalla de Precios
  (spec 004), y de ninguna otra forma.
- **REQ-3** — Antes de escribir, debe verificar que la publicación se puede tocar (RN-3) y, si no,
  informar el motivo sin escribir.
- **REQ-4** — Después de escribir, debe leer la publicación de nuevo y guardar en el historial el
  precio que quedó.

## Reglas de negocio
- **RN-1** — Precio a publicar = el de ML de la combinación (spec 003) × unidades si es un pack
  (spec 003, RN-3), inflado por la promo del modelo si tiene: `publicado = final / (1 − promo)`,
  como la calculadora (`precios.ts:235`, `precioConPromo`).
- **RN-2** — Una publicación con variaciones lleva el **mismo precio en todas**: es una regla de
  ML. Si sus variaciones están mapeadas a combinaciones con precios distintos, no se escribe y se
  informa "precios distintos en una publicación con variaciones".
- **RN-3** — No se escribe si la publicación está cerrada o en revisión, o si tiene una
  **automatización de precios** activa (ML rechaza el cambio).
- **RN-6** — Una publicación en **campaña** sí se escribe (2026-10-24, TASK-016): el precio cambia,
  pero el cliente sigue pagando el de la oferta hasta que la campaña termina o se saca la
  publicación, y la pantalla lo avisa con la fecha. Si el precio nuevo queda **por debajo** del de la
  oferta, ML elimina la promoción y el ERP no la puede volver a poner: pide la confirmación aparte,
  como un cambio de más de 30 %.
- **RN-4** — Sólo el campo de precio. Ningún otro campo de la publicación viaja en la escritura.
- **RN-5** — De a una publicación, con pausa entre cada una, y se corta todo ante un error de
  autorización.

## Criterios de aceptación
- [ ] **CA-1** — Dada una publicación sin variaciones a $59.990 y un propuesto de $64.990, cuando se
  aplica, entonces ML la muestra a $64.990 y el historial guarda $59.990 → $64.990 con la respuesta.
- [ ] **CA-2** — Dada una publicación con automatización de precios, entonces la pantalla dice por
  qué no se puede aplicar y no se manda nada a ML.
- [ ] **CA-3** — Dada una publicación con dos variaciones mapeadas a combinaciones de distinto
  precio, entonces no se escribe y se informa.
- [ ] **CA-4** — Ningún campo además del precio cambia en la publicación (comparando el `GET`
  antes y después).

## Casos borde
- El token de ML venció: se renueva como hoy (`mlFetch`); si no se puede, se corta y se informa.
- ML acepta el cambio pero publica otro número (redondeo propio): se guarda el que quedó.
- Publicación de otro negocio (Shay): nunca aparece, porque su clave está marcada así en el mapeo.
- ML recalcula solo el envío gratis obligatorio por el precio (verificado el 2026-10-24: bajar de
  $43.000 a $32.541 lo sacó y volver lo puso) y renueva el vencimiento con cualquier escritura. No
  es un campo que toque el ERP, pero cambia lo que ve el comprador: se informa en el resultado y en
  el historial.

## Fuera de alcance
- Crear o terminar promociones en ML.
- Stock, Flex o tiempo de disponibilidad: es la feature 002.

## Preguntas abiertas
Ninguna. Lo técnico se verificó el 2026-10-24 (TASK-012 y TASK-016): el cambio de marzo de 2026
sólo bloquea las publicaciones con automatización de precios, y las campañas se resolvieron con
RN-6.

## Referencias
- `inventario_sendero3d/src/lib/mercadolibre.ts:210` (`mlFetch`).
- [Precios de productos (ML)](https://developers.mercadolibre.com.ar/es_ar/api-de-precios),
  [Variaciones (ML)](https://developers.mercadolibre.com.ar/es_ar/variaciones),
  [Automatización de precios](https://global-selling.mercadolibre.com/devsite/manage-automations).
