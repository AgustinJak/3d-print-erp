---
id: 008-crear-en-ml
feature: 006-precios-en-el-erp
titulo: Crear en Mercado Libre, pausado y ya enlazado, un producto nuevo del ERP
estado: draft
actualizado: 2026-10-29
---

# Crear en ML

## Contexto

Pedido de Agustín, 2026-10-29: que un producto nuevo quede creado en ML, desactivado, con lo
mínimo, enlazado al ERP y con sus precios; después él le carga en ML fotos, título y descripción.
Hoy lo crea a mano en ML y después hay que mapearlo.

## Requisitos

- **REQ-1** Desde la página del producto en el ERP, "Crear en Mercado Libre": crea las dos
  opciones de venta (spec 006), pausadas, con la categoría (spec 004) y los precios (specs 003 y
  006), y deja las claves de ML enlazadas a sus combinaciones.
- **REQ-2** Si el producto tiene variantes que se venden, una variante por combinación (User
  Products), cada una en las dos opciones.
- **REQ-3** Vista previa antes de crear: título, categoría, tipo, precio, cuotas, envío y stock de
  cada publicación. Se crea sólo al confirmar.
- **REQ-4** Antes de construir, TASK-017 verifica en la doc de ML, con una prueba sobre un producto
  que elija Agustín: si se puede crear pausado (o pausar en el mismo paso), qué pide la categoría
  como mínimo (fotos, atributos como marca y modelo) y cómo se crean las variantes de un User
  Product.

## Reglas de negocio

- **RN-1** No se crea solo con cada pieza nueva de Bodega: Bodega da de alta pruebas, insumos y
  opciones que no son productos (17 de esas en la revisión del 2026-10-25). Se crea con un botón,
  producto por producto. Si Agustín lo quiere automático, sería sólo para los productos que él
  marque como "para vender en ML".
- **RN-2** El título inicial sale del nombre del producto y respeta las reglas de cara al cliente:
  sin "impresión 3D", "imprimir", "impreso", "impresora", "PLA" ni "Sendero 3D"; en ML, sin
  "réplica", "tipo" ni "símil". Si el nombre las tiene, la vista previa lo marca y no deja crear.
- **RN-3** Si ML exige una foto para crear, se usa la del producto en el ERP; si no tiene, no se
  crea y se dice por qué.
- **RN-4** Después de crear, el ERP no toca título, descripción ni fotos: eso lo edita Agustín en
  ML. El ERP sigue manejando precio, stock y (spec 007) Flex.
- **RN-6** **Nada automático** (Agustín, 2026-10-30): el ERP nunca crea una publicación solo, ni
  cuando aparece un producto nuevo. Se crea sólo cuando Agustín toca el botón y acepta la vista
  previa, y los precios con que se crea los acepta ahí mismo.
- **RN-5** Crear en ML es público: la primera vez, un solo producto elegido por Agustín, y cada
  creación queda registrada.

## Criterios de aceptación

- **CA-1** Un producto de prueba queda en ML con las dos opciones, pausadas, y aparece enlazado en
  Precios con sus precios.

## Decisiones

- Botón por producto (Agustín, 2026-10-29: "botón por ahora"). Lo automático queda para más
  adelante, sólo para productos marcados "para vender en ML".

## Lo que se verificó con `POST /items/validate` (2026-10-30, sin crear nada)

- ML usa **User Products**: pide `family_name` (sin `title`).
- Obligatorios: `BRAND`, `MODEL`, `EMPTY_GTIN_REASON` (sin código de barras) y las medidas y el peso
  del paquete (`SELLER_PACKAGE_HEIGHT`, `_WIDTH`, `_LENGTH`, `_WEIGHT`). El ERP sólo tiene el
  peso: la vista previa tiene que pedir las medidas.
- Con todo eso, `validate` contesta 400 sólo con **avisos**: "User has not mode me1" (de la
  configuración de envíos de la cuenta) y, debajo de $30.000, "Free shipping costs exceeds sale"; a
  $35.000, "Mandatory free shipping added". No se sabe si bloquean la creación real: se confirma
  creando el primero, pausado, con el producto que elija Agustín.
- Las publicaciones actuales usan `BRAND=Generic` y garantía "de fábrica, 10 días".

## Primera creación de prueba (2026-10-30, el Dumpling Clicker, elegido por Agustín)

- **MLA2249115007**, "Llavero Dumpling Clicker Fidget Antiestrés", Souvenirs › Llaveros (MLA457519,
  la del llavero clicker BT21; el predictor había dado "Adiestramiento › Clickers"), Clásica a $9.212,
  stock 1, paquete 10 × 10 × 10 cm y 80 g (estimados, como el BT21), garantía de fábrica 10 días,
  marca Generic. Sólo la opción 1: la 2 daba $28.890 (envío gratis estimado $9.900) para un producto
  de $8.290.
- **Sin foto ML no deja crear** (`item.listing_type_id.requiresPictures`, error). La foto la pasó
  Agustín: `POST /pictures/items/upload` (multipart) y en la publicación `pictures: [{ id }]`.
- **`status: "paused"` al crear no sirve**: ML la creó activa. Se pausó en el paso siguiente
  (`PUT /items/{id}` con `status: paused`); quedó activa alrededor de un segundo.
- Los avisos de `validate` ("User has not mode me1", "Free shipping costs exceeds sale") **no
  bloquearon** la creación real.
- Quedó enlazada al Dumpling en `mapeos_canal` (origen manual) y la categoría del producto quedó a
  mano (MLA457519).

## Construido (2026-10-30)

- Página del producto, sección "Sin publicar en Mercado Libre": las combinaciones activas con precio y
  sin publicación de ML. "Crear en ML" abre el borrador del ERP (`src/lib/crear-ml.ts`): nombre,
  categoría, opción 1 con lo que deja, opción 2 opcional (desmarcada si sale más del doble), medidas y
  peso del paquete, stock y fotos del producto.
- "Revisar en ML" (`POST /api/modelos/[id]/crear-ml` sin `aplicar`): palabras prohibidas, foto,
  medidas, y `/items/validate`. "Crear pausada" sólo con la revisión sin errores y sin cambios desde
  entonces: crea, pausa, enlaza en `mapeos_canal`, registra en `cambios_precio` (estado "creada") y
  deja la categoría como la del producto.
- Falta: productos con variantes (una publicación por combinación de un mismo User Product). Hoy se
  crea una publicación por combinación, suelta.
