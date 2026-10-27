---
id: 003-claude-por-mcp
feature: 005-publicidad-ml
titulo: Que una sesión de Claude lea y gestione la publicidad con las mismas reglas que la pantalla
estado: validated
actualizado: 2026-10-26
---

# Claude por MCP

## Contexto

El MCP oficial de ML sólo busca en su documentación. Agustín quiere que una sesión de Claude con
skills de publicidad analice y ajuste las campañas.

## Requisitos

- **REQ-1** Un servidor MCP local (stdio) en el repo del ERP, que corre en la PC con el `.env` del
  ERP y usa las mismas funciones que la pantalla: mismo cálculo, mismas reglas, mismo registro.
- **REQ-2** Herramientas de lectura: resumen del período, detalle de una campaña con sus anuncios
  e historial de cambios.
- **REQ-3** Herramientas de escritura: cambiar una campaña y cambiar un anuncio. Sin
  `aplicar: true` devuelven la vista previa y no tocan nada.
- **REQ-4** Registro en `.mcp.json` del ERP y una skill que explica el método (ROAS mínimo, no
  tocar todos los días, Shay aparte).

## Reglas de negocio

- **RN-1** Las mismas de la spec 002. Lo que Claude cambia queda con origen `claude`.
- **RN-2** Las herramientas de escritura no se agregan a la lista de permitidas: Claude Code pide
  permiso en cada llamada, y esa es la confirmación de Agustín.

## Criterios de aceptación

- **CA-1** Una sesión de Claude Code abierta en el repo del ERP ve las herramientas y lee el
  resumen.
- **CA-2** Una escritura sin `aplicar` no cambia nada en ML ni en el registro.
