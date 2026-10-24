---
id: 005-alta-desde-bodega
feature: 004-estructura-del-catalogo
titulo: Una pieza nueva de Bodega entra al ERP como producto, como opción de un producto o como insumo, según cómo se llama y dónde está
estado: validated
actualizado: 2026-10-24
---

# Alta desde Bodega

## Contexto
Hoy cada pieza nueva de Bodega crea un producto en el ERP (`altas-bodega.ts`). Para un producto
simple está bien; para los colores de la Bola de JOJOS crea dos productos sueltos, y para una funda
crea un producto que nadie vende. Agustín (2026-10-24): usar una convención de nombre para que el
ERP arme solo los productos con variantes.

## Requisitos
- **REQ-1** — Una pieza llamada **"Producto · Opción"** debe entrar como la opción "Opción" del
  grupo "otra pieza" del producto "Producto", con su fila de stock enganchada.
- **REQ-2** — Si "Producto" no existe, debe crearse con un grupo "otra pieza" llamado "Variante"
  (se renombra en la página).
- **REQ-3** — Si "Producto" existe sin grupo "otra pieza", debe crearse ese grupo.
- **REQ-4** — Una pieza en la categoría **"Insumos"** de Bodega debe entrar como insumo (spec 006),
  no como producto.
- **REQ-5** — Cualquier otra pieza debe entrar como producto simple, como hoy.
- **REQ-6** — Si la pieza no se puede ubicar sin dudar (ver casos borde), debe quedar en una lista
  **Piezas nuevas** en Productos, con un botón por destino posible.
- **REQ-7** — Las piezas que ya existían antes de esta feature no deben entrar solas (la lista
  "no traer" de hoy se mantiene).

## Reglas de negocio
- **RN-1** — El separador es " · " (punto medio con espacios), el mismo que usa el ERP en las
  etiquetas de stock. Se toma el **último** separador: "Katana · Edición · Roja" es la opción
  "Roja" de "Katana · Edición".
- **RN-2** — "Producto" se busca por nombre exacto sin distinguir mayúsculas ni espacios de más,
  entre los productos activos que no son insumos.
- **RN-3** — Si el producto ya tiene una opción con ese nombre y su fila está libre, se engancha;
  si está enganchada a otra pieza, va a Piezas nuevas (conflicto).
- **RN-4** — El nombre de la categoría de insumos es "Insumos" (se crea en Bodega una vez).

## Criterios de aceptación
- [ ] **CA-1** — Dadas dos piezas nuevas "Bola X · Rojo" y "Bola X · Azul" y ningún producto "Bola
  X", entonces queda un producto "Bola X" con dos opciones, cada una enganchada a su pieza.
- [ ] **CA-2** — Dada una pieza "Funda Itachi 95cm" en la categoría Insumos, entonces aparece como
  insumo y no en la lista de productos.
- [ ] **CA-3** — Dada una pieza "Hacha Prime 2", entonces entra como producto simple.
- [ ] **CA-4** — Dada "Bola de JOJOS · Verde Comun" cuando esa opción ya está enganchada a otra
  pieza, entonces va a Piezas nuevas con el motivo.

## Casos borde
- El producto existe pero está consolidado o inactivo: va a Piezas nuevas.
- Un nombre con " · " que no es una variante (raro): se mueve desde Piezas nuevas, o se le cambia
  el nombre en Bodega.
- Una pieza a la que se le cambia el nombre en Bodega después de entrar: el enganche es por id, no
  por nombre; no pasa nada.

## Fuera de alcance
- Grupos de decoración o de insumo desde Bodega: no son piezas.
- Borrar en el ERP lo que se borra en Bodega (Bodega sube, nunca borra).

## Preguntas abiertas
Ninguna.

## Referencias
- `src/lib/altas-bodega.ts` (alta automática, "no traer", conflictos).
- Llamado desde `/api/cambios`, `GET /api/stock` y el cron diario (`/api/cron/ml`).
