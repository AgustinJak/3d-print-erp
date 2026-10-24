---
id: 008-cambios-en-bodega
feature: 004-estructura-del-catalogo
titulo: Bodega llama "piezas" a lo que imprime y deja de tener su propio mapeador con el ERP
estado: validated
actualizado: 2026-10-24
---

# Cambios en Bodega

La implementa la sesión del inventario, dueña también de Bodega desde el 2026-10-24
(`Bodega/Bodega3D-App`). La release sale cuando Agustín la pida.

## Contexto
En Bodega, "modelo" es la pieza que se imprime; en el ERP, "modelo" es el producto que se vende.
La misma palabra para dos cosas es la confusión de "en Bodega hay dos bolas y en el ERP una".
Además Bodega tiene su propio mapeador con el ERP (Configuración › Stock del ERP), que con esta
feature pasa a hacerse en la página del producto.

## Requisitos
- **REQ-1** — Bodega debe decir **"Pieza"** donde hoy dice "Modelo" en la interfaz (menú, títulos,
  botones, avisos). El código y la base no cambian de nombre.
- **REQ-2** — La sección Configuración › Stock del ERP debe desaparecer, con un aviso de que el
  enganche se hace en la página del producto del ERP.
- **REQ-3** — Al crear una pieza, Bodega debe mostrar la convención: "Para una variante, nombrala
  'Producto · Opción' (ej. 'Bola de JOJOS · Verde común'). Las fundas, en la categoría Insumos."
- **REQ-4** — Bodega debe tener la categoría **Insumos** (se crea sola si no existe).

## Reglas de negocio
- **RN-1** — Nada cambia en la sincronización: Bodega sigue subiendo piezas a `bodega.models`.

## Criterios de aceptación
- [ ] **CA-1** — Dada la app, entonces el menú dice "Piezas" y no aparece "Modelos".
- [ ] **CA-2** — Dada Configuración, entonces no está la sección Stock del ERP.
- [ ] **CA-3** — Dado "Nueva pieza", entonces se ve la convención de nombre.

## Casos borde
- Una versión vieja de Bodega instalada en otra PC sigue teniendo el mapeador: funciona igual (usa
  la misma función del ERP), sólo que ya no hace falta.

## Fuera de alcance
- Que Bodega cree piezas pedidas desde el ERP (Bodega no crea modelos que bajan de la nube).

## Preguntas abiertas
Ninguna.

## Referencias
- `Bodega/Bodega3D-App/src/renderer/src/pages/Configuracion.tsx:927` (el mapeador).
- `Bodega/Bodega3D-App/src/main/stock-erp.ts:340` (la llamada a `bodega_mapear_modelo`).
