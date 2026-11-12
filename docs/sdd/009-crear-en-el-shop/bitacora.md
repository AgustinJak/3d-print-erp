---
feature: 009-crear-en-el-shop
---

# Bitácora 009

## 2026-11-11 · Claude (sesión del inventario)

**Tareas:** TASK-001 y TASK-002 (completed), TASK-003 (pending).

**Qué se hizo.** El emisor del contrato 7c, que armó la sesión del Shop el mismo día (docs/sdd/024 del
Shop). Firma igual que el contrato 7 (`firmarParaShop`). El borrador reusa las medidas de la
publicación de ML más grande (`paqueteDeSusPublicaciones`, ahora exportada) y lee las categorías del
Shop con la clave publicable (`leerCategoriasShop`).

**Cómo se probó.** Sólo el borrador, con datos reales: de 36 productos activos sin nada en la web, 11
se pueden mandar ya; a los demás les falta el SKU o el precio de alguna combinación, y la pantalla lo
dice antes de dejar revisar. **No se pudo simular contra el Shop desde acá:** el secreto
`SHOP_WEBHOOK_SECRET` sólo está en Vercel. Lo primero en producción es "Revisar en el Shop", que no crea
nada.

**Para tener en cuenta.** Si se crea y la respuesta no llega (corte), reintentar: el Shop devuelve
`ya_existe` y se mapea igual. La función tiene hasta 300 s porque el Shop baja y optimiza cada foto.
