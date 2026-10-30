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
- **RN-5** Crear en ML es público: la primera vez, un solo producto elegido por Agustín, y cada
  creación queda registrada.

## Criterios de aceptación

- **CA-1** Un producto de prueba queda en ML con las dos opciones, pausadas, y aparece enlazado en
  Precios con sus precios.

## Decisiones

- Botón por producto (Agustín, 2026-10-29: "botón por ahora"). Lo automático queda para más
  adelante, sólo para productos marcados "para vender en ML".
