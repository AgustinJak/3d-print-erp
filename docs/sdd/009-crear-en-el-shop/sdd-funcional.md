---
id: 009
feature: crear-en-el-shop
estado: in-review
creado: 2026-11-11
---

# 009: Crear un producto en el Shop desde el ERP

## Qué pasaba

Un producto nuevo se cargaba dos veces, en el ERP y en el panel del Shop, y después había que mapear
a mano cada combinación. Con Mercado Libre eso ya se hace desde el ERP (SDD 006, spec 008).

## Qué se quiere

Agustín, el 2026-11-11: crear el producto en el Shop desde el ERP, como con ML, y que quede mapeado.

- **REQ-1** Desde la página del producto, un borrador con nombre, descripción opcional, categoría del
  Shop, peso, medidas, las variantes con su precio web y las fotos.
- **REQ-2** Revisar contra el Shop sin crear nada, con los errores que devuelva.
- **REQ-3** Al confirmar, el Shop lo crea oculto y el ERP mapea cada combinación con la clave que
  responde el Shop.

## Reglas

- **RN-1** Nunca automático: revisar y después crear, a mano.
- **RN-2** Las variantes, los precios y las fotos salen de la base al mandar, no de la pantalla.
- **RN-3** El precio es el web de Precios. Todas las combinaciones activas tienen que tenerlo.
- **RN-4** Hace falta el SKU del producto: el Shop lo usa para no duplicar. Un reintento con el mismo
  SKU devuelve `ya_existe` con las mismas claves, y se mapea igual.
- **RN-5** Sólo fotos del bucket `imagenes` del ERP, todas generales. Las de cada color se asignan en el
  Shop.
- **RN-6** El producto nace oculto y se activa en el panel del Shop.
- **RN-7** El texto que ve el cliente no dice "impresión 3D", "impreso", "PLA" ni "Sendero 3D": el Shop
  lo rechaza.

## Contrato

El 7c, en `Flujos del ecosistema.md` y en `Shop/sendero-shop/docs/sdd/024-productos-desde-el-erp/`.

## Fuera de alcance

- Crear varios a la vez desde Productos.
- Editar o activar el producto del Shop desde el ERP.
