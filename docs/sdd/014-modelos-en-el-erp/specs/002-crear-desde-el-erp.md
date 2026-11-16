---
id: 002-crear-desde-el-erp
feature: 014-modelos-en-el-erp
titulo: Un producto nuevo se crea en el ERP con su archivo, su pieza y su fila de stock
estado: draft
actualizado: 2026-11-16
---

# Crear el producto en el ERP

## Contexto
Hoy un producto nuevo nace en la Bodega y el ERP lo da de alta solo (`src/lib/altas-bodega.ts`).
"Nuevo producto" crea sólo un nombre (`src/app/(app)/modelos/page.tsx:531`) y se usó para 4
productos activos sin pieza. Con el costo, el precio y el cotizador en el ERP, el alta tiene que
pasar acá.

## Requisitos
- **REQ-1** — "Nuevo producto" abre un alta que acepta un archivo 3D, opcional.
- **REQ-2** — Con un 3MF, el alta completa los gramos, el tiempo y la miniatura leídos del archivo.
- **REQ-3** — El alta muestra el costo y los precios por canal, igual que el cotizador.
- **REQ-4** — Al confirmar, crea el producto, su pieza en `bodega.models`, su fila de stock enganchada
  y sube el archivo a la pieza.
- **REQ-5** — Sin archivo, el alta crea el producto solo, como hoy (kits, repuestos, reventa).
- **REQ-6** — Desde la página de un producto se puede agregar una opción con su propio archivo
  ("Producto · Opción"), que crea su pieza y su fila de stock.
- **REQ-7** — El cotizador tiene "Crear producto con esto", que abre el alta con lo cargado.
- **REQ-8** — "Traer de Bodega" se saca cuando la etapa 3 está en uso.

## Reglas de negocio
- **RN-1** — El id de la pieza nueva lo genera el ERP (UUID), con el mismo formato que la Bodega.
- **RN-2** — La pieza se crea enganchada a su fila de stock en el mismo paso, para que el alta
  automática (`altas-bodega.ts`) no la tome como nueva y duplique el producto.
- **RN-3** — El material por defecto es el marcado como tal en `bodega.materials`.
- **RN-4** — El nombre de la pieza es el del producto, o "Producto · Opción" si es una opción
  (convención del SDD 004).
- **RN-5** — Si la subida del archivo falla, el producto y la pieza quedan creados sin archivo, y se
  avisa para reintentar.

## Criterios de aceptación
- [ ] **CA-1** — Dado un 3MF laminado, cuando lo suelto en "Nuevo producto", entonces veo los gramos,
  el tiempo, la miniatura, el costo y los precios sin escribir nada.
- [ ] **CA-2** — Dado el alta confirmada, entonces existe el producto, la pieza en `bodega.models`, la
  fila de stock con `bodega_model_id` y el archivo en la pieza, y "Traer de Bodega" no trae nada.
- [ ] **CA-3** — Dado un alta sin archivo, entonces se crea sólo el producto, como hoy.
- [ ] **CA-4** — Dado el cotizador con datos cargados, cuando toco "Crear producto con esto",
  entonces se abre el alta con esos datos.
- [ ] **CA-5** — Dado un producto existente, cuando agrego una opción con archivo, entonces queda la
  opción con su pieza y su fila de stock.

## Casos borde
- Un archivo de cientos de MB: la lectura de gramos y tiempo se hace en el navegador sin descomprimir
  los modelos (sólo `slice_info.config` y las miniaturas).
- Un STL: no trae gramos ni tiempo; se cargan a mano, como en el cotizador.
- Doble clic en confirmar: el alta no crea dos productos.

## Fuera de alcance
- Que la Bodega deje de crear piezas (spec 003). Mientras tanto conviven las dos altas.
- Publicar en canales: sigue como hoy, desde la página del producto.

## Preguntas abiertas
- [ ] ¿El alta pide también la serie y la categoría, o se completan después en la página?
  (propuesta: serie sí, opcional, como hoy; categoría después).

## Referencias
- ERP: `src/app/(app)/modelos/page.tsx:93,218,531`, `src/lib/altas-bodega.ts`,
  `src/lib/cotizador.ts`, `src/app/(app)/cotizador/page.tsx`.
- Memoria del proceso manual que esto reemplaza: crear piezas sin archivo y engancharlas al ERP
  en el mismo paso (2026-08-28 y 2026-10-24).
