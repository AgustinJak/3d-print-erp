---
id: 001-una-sola-pagina
feature: 004-estructura-del-catalogo
titulo: La página del modelo es el único lugar donde se ve y se configura un modelo
estado: validated
actualizado: 2026-10-24
---

# Una sola página

## Contexto
Hoy un modelo se configura en tres lugares: el lápiz de `/modelos` (un diálogo con todos los
datos y las variantes), la página del modelo (`/modelos/[id]`, que muestra pero casi no edita, y
donde se arman los accesorios) y el mapeador de Bodega. El botón "Editar" de la página ni
siquiera abre un editor: vuelve a la lista. Agustín: "es mucho mareo, juntá todo en la página del
modelo y sacá el lápiz".

## Requisitos
- **REQ-1** — La página del modelo debe permitir ver y cambiar todo lo que hoy cambia el lápiz.
- **REQ-2** — La lista de modelos no debe tener lápiz ni diálogo de edición: tocar un modelo abre
  su página.
- **REQ-3** — "Nuevo modelo" debe pedir sólo el nombre (y, opcional, serie y categoría), crearlo
  y abrir su página.
- **REQ-4** — Consolidar, revertir la consolidación y eliminar deben estar en la página del
  modelo, en un menú del encabezado.
- **REQ-5** — Los enlaces viejos al diálogo (`/modelos?edit=<id>`, `/modelos?nuevo=1`) deben
  llevar a la página nueva.
- **REQ-6** — El ERP debe decir **"Productos"** donde hoy dice "Modelos" (menú, títulos, botones).
  La ruta `/modelos` y la base no cambian.
- **REQ-7** — La pestaña Integraciones › SKUs debe desaparecer: la lista de productos ya tiene el
  filtro "Sin SKU".

## Reglas de negocio
- **RN-1** — Un modelo nuevo nace activo, sin precio ni costo (0), con su fila de stock y su
  combinación, igual que hoy (`POST /api/modelos`).
- **RN-2** — Eliminar sigue fallando si el modelo tiene ventas (`ItemPedido.modelo` es
  `restrict`); la página lo explica y ofrece desactivarlo.

## Criterios de aceptación
- [ ] **CA-1** — Dado `/modelos`, cuando se mira una fila, entonces no hay lápiz, y tocarla abre
  `/modelos/<id>`.
- [ ] **CA-2** — Dado "Nuevo modelo" con nombre "Prueba", cuando se crea, entonces se abre
  `/modelos/<id>` de "Prueba", con una fila de stock y una combinación.
- [ ] **CA-3** — Dado `/modelos?edit=<id>`, cuando se abre, entonces redirige a `/modelos/<id>`.
- [ ] **CA-4** — Dado un modelo con ventas, cuando se elige "Eliminar", entonces no se borra y la
  página ofrece desactivarlo.
- [ ] **CA-5** — Dado un modelo consolidado, cuando se abre su página, entonces se ve en cuál está
  consolidado y un botón para revertirlo.
- [ ] **CA-6** — Dado el menú del ERP, entonces dice "Productos", e Integraciones no tiene la
  pestaña SKUs.

## Casos borde
- Un modelo de otro tenant o inexistente: "Modelo no encontrado", como hoy.
- Dos pestañas editando el mismo modelo: gana el último guardado de cada sección (ver spec 002).

## Fuera de alcance
- Cambiar los filtros, el orden o las vistas de la lista.

## Preguntas abiertas
Ninguna.

## Referencias
- `src/app/(app)/modelos/page.tsx:1010` (el diálogo), `:913` (el lápiz), `:342` (enlaces `?edit`).
- `src/app/(app)/modelos/[id]/page.tsx:129` ("Editar" que vuelve a la lista).
- `src/app/(app)/integraciones/page.tsx` ("Cargar SKU" abre `/modelos?edit=`).
