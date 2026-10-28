---
id: 004-que-conviene-hacer
feature: 005-publicidad-ml
titulo: Recomendaciones concretas de qué cambiar en la publicidad, sin IA, con el valor exacto
estado: implemented
actualizado: 2026-10-28
---

# Qué conviene hacer

## Contexto

Mercado Libre no deja escribir publicidad desde aplicaciones (401 desde el 2026-10-28), así que
Agustín cambia todo a mano en el panel. Pidió ayudas de qué conviene cambiar. Eligió reglas fijas,
gratis e instantáneas, en vez de un chat con la API de Claude: para preguntar más a fondo usa su
sesión de Claude Code con el MCP.

## Requisitos

- **REQ-1** Una tarjeta "Qué conviene hacer" arriba de la página: cada recomendación con la acción
  y el valor exacto, el porqué con números, y un botón ("Cómo hacerlo" abre la vista previa con
  qué tocar en el panel; "Ver en Precios"; "Ver cuáles").
- **REQ-2** Las mismas recomendaciones en el MCP (`que_conviene_hacer`).
- **REQ-3** Siempre con los últimos 30 días, aunque la pantalla muestre otro período.

## Reglas de negocio

- **RN-1** Pausar un anuncio activo de una campaña activa: gastó al menos $5.000 con 15 clics o
  más y ninguna venta, o vende con un ROAS menor al 70 % de su mínimo.
- **RN-2** Subir el ROAS objetivo cuando está debajo del ROAS mínimo de la campaña: a mínimo ×
  1,25, redondeado a un decimal, entre 1 y 35.
- **RN-3** Con el objetivo bien y la campaña perdiendo plata (gasto de $10.000 o más, cobertura de
  costo de al menos 50 %): pausarla si no vendió nada; si vendió, bajar el presupuesto 30 %.
- **RN-4** Subir el presupuesto 25 % (redondeado arriba a $100) si gastó $10.000 o más, pierde 10 %
  o más de impresiones por presupuesto, su ROAS supera el mínimo por 20 % y dejó ganancia.
- **RN-5** Revisar el precio de un anuncio que no deja ganancia ni sin publicidad, con link a
  Precios (puede ser la receta de Bodega).
- **RN-6** Sumar a una campaña las publicaciones sin campaña con ROAS mínimo de 3 o menos.
- **RN-7** Nada sobre campañas de Shay ni pausadas. Nada sobre una campaña cambiada desde el ERP
  hace menos de 7 días (los cambios hechos a mano en el panel no se ven: el `last_updated` de ML
  cambia también solo).
- **RN-8** Lo que pierde plata va primero, ordenado por la plata en juego.

## Criterios de aceptación

- **CA-1** 15 casos en `scripts/sdd-005-probar-publicidad.ts`.
- **CA-2** Con los datos reales del 2026-10-28 salen 7, todas con sentido (verificado con Agustín
  a la vista: vaso BTS sin ventas, Caja Guarda que no cierra, presupuesto de Accesorios Kpop).

## Fuera de alcance

- Un chat con la API de Claude dentro del ERP (descartado el 2026-10-28: Agustín usa Claude Code).
