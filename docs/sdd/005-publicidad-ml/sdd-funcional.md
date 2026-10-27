---
feature: 005-publicidad-ml
epica: ninguna
estado: validated
autor: Agustín (pedido) · Claude (sesión del inventario)
actualizado: 2026-10-26
---

# SDD funcional · Publicidad de Mercado Libre

> Validado: Agustín pidió el 2026-10-26 arrancar "en cuanto lo tengas", con el MCP para Claude y
> una sección en el ERP para manejarlo él, "legible y bonita".

## 1. Objetivo

Saber qué campañas de Product Ads dejan plata y cuáles no, con el costo real de cada producto, y
poder ajustarlas desde el ERP o desde una sesión de Claude, con las mismas reglas y un registro
de todo lo que se cambia.

## 2. Actores y permisos

- **Agustín**, en la página Publicidad del ERP (tenant `sendero3d`; la demo no la ve).
- **Una sesión de Claude**, por el MCP local. Cada escritura la aprueba Agustín en Claude Code.

## 3. Flujos

### 3.1 Mirar
Publicidad → elegir período → ver los cuatro números y las campañas → abrir una → ver sus
anuncios y alertas.

### 3.2 Cambiar
Editar campaña o anuncio → vista previa "antes → después" con avisos (cambio grande, campaña de
Shay, cambiada hace poco) → confirmar → ML contesta → queda en el historial.

### 3.3 Claude
Claude pide el resumen → analiza contra el ROAS mínimo → propone (vista previa) → Agustín aprueba
la llamada con `aplicar` → mismo registro, origen `claude`.

## 4. Reglas de negocio

Las de las specs 001 (cálculo) y 002 (cambios). La 003 no agrega reglas: usa las mismas.

## 5. Pantallas

Una página, **Publicidad** (grupo Negocio del menú), con dos pestañas: **Campañas** e
**Historial**. Cuatro tarjetas arriba, campañas como filas que se abren, diálogos de edición con
vista previa.

## 6. Specs

- [001-ver-la-publicidad](specs/001-ver-la-publicidad.md)
- [002-cambiar-la-publicidad](specs/002-cambiar-la-publicidad.md)
- [003-claude-por-mcp](specs/003-claude-por-mcp.md)

## 7. Fuera de alcance

Brand Ads, Display, crear o borrar campañas, cambios automáticos, publicidad de la web.

## 8. Dependencias

- Permiso `urn:ml:mktp:ads:/read-write` (listo el 2026-10-26).
- Costos de Bodega (SDD 003). Lo que no tiene costo cae al costo de las ventas.

## 9. Decisiones tomadas

- El MCP corre local y habla directo con la base y ML, como los scripts del ERP. No hay API
  pública nueva en el ERP para Claude.
- Lo que cambia ML queda registrado en una tabla propia (`cambios_publicidad`), no en
  `cambios_precio`.

## 10. Preguntas abiertas

- Ninguna que frene. La fase de aprendizaje tras cada cambio sale de fuentes no oficiales: se
  avisa, no se bloquea.
