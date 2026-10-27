---
id: 002-cambiar-la-publicidad
feature: 005-publicidad-ml
titulo: Cambiar campañas y anuncios desde el ERP, con vista previa y registro
estado: validated
actualizado: 2026-10-26
---

# Cambiar la publicidad

## Contexto

El token del ERP tiene `urn:ml:mktp:ads:/read-write` desde el 2026-10-26. La API permite cambiar
presupuesto diario, estado, ROAS objetivo y estrategia de una campaña, y pausar, activar o mover
un anuncio entre campañas.

## Requisitos

- **REQ-1** En cada campaña: cambiar presupuesto diario, ROAS objetivo, estrategia y pausar o
  activar.
- **REQ-2** En cada anuncio: pausar, activar o pasarlo a otra campaña.
- **REQ-3** Nada se manda sin ver antes el "antes → después" y confirmar.
- **REQ-4** Cada cambio queda registrado: qué, antes, después, quién (pantalla o Claude), cuándo
  y qué contestó ML. Una pestaña Historial lo muestra.

## Reglas de negocio

- **RN-1** ROAS objetivo entre 1 y 35 (límite de ML). Presupuesto diario mayor que cero.
- **RN-2** Un cambio de presupuesto de más del 50 % pide una confirmación aparte.
- **RN-3** Tocar una campaña de Shay pide una confirmación aparte.
- **RN-4** Cada cambio vuelve a poner la campaña "en aprendizaje" (fuente no oficial): la
  confirmación muestra cuándo fue el último cambio de esa campaña y lo advierte si fue hace menos
  de 7 días.
- **RN-5** Si ML rechaza el cambio, se registra con el error y la pantalla lo muestra.

## Criterios de aceptación

- **CA-1** El primer cambio real lo elige Agustín. Después, la campaña en ML tiene el valor nuevo
  y el historial lo muestra.
- **CA-2** Un ROAS de 0,5 o de 40 no llega a ML: lo frena el ERP.

## Fuera de alcance

- Crear o borrar campañas. Cambios automáticos sin confirmación.
