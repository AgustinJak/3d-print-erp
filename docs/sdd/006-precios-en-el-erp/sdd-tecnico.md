---
feature: 006-precios-en-el-erp
estado: validated
actualizado: 2026-10-29
---

# SDD técnico · Precios en el ERP

## 1. Estado actual

- El costo ya lo calcula el ERP con los datos crudos de Bodega (`costos-bodega.ts`: gramos,
  tiempo, insumos, material y parámetros de `bodega.cost_settings`).
- Las decisiones de precio las lee de Bodega: `bodega.cost_settings.gastos_venta` (gastos, margen,
  promo, redondeo) en `leerGastosDeVenta()`, y la política y la foto de cada pieza
  (`bodega.models.margen/redondeo/promo_ml/precios`) en `leerPiezasDeBodega()`, los dos en
  `precios-combinacion.ts`.
- La fórmula es una copia de la de Bodega (`precios-bodega.ts`), con
  `scripts/sdd-003-copiar-formula.ts` y `scripts/sdd-003-comparar-formula.ts` para mantenerlas
  iguales.
- `leerPreciosMl()` (`precios-ml.ts`) guarda por clave de ML el precio y una lectura (estado,
  promo, lo que paga el cliente, automatización, variaciones, catálogo). No lee tipo, envío ni
  categoría.

## 2. Modelo de datos

Un archivo, `prisma/sql/precios-en-el-erp.sql`, aditivo.

| Dónde | Qué |
|---|---|
| `config_precios` (nueva) | `tenant_id` pk, `gastos` jsonb (los de `GastosVenta` más `redondeo`), `actualizado_en`, `usuario` |
| `cambios_config_precios` (nueva) | `id`, `tenant_id`, `antes` jsonb, `despues` jsonb, `usuario`, `creado_en` (REQ-3 de la spec 001) |
| `modelos` | `margen`, `promo_ml` (float, null = el general), `redondeo` (text, null), `categoria_ml` (text), `categoria_ml_origen` (`publicacion` · `heredada` · `predicha` · `manual`) |
| `mapeos_canal.precio_lectura` (jsonb, ya existe) | suma `tipo`, `envioGratis`, `costoEnvio`, `categoria`, `campaniaCuotas`, `comision { pct, recargoCuotas, fijo, aPrecio }` |
| `config_tenant.data.tarifasMl` | las tarifas leídas: % y recargo por categoría y tipo, y los tramos del cargo fijo, con fecha |

## 3. La fórmula

- `precios-bodega.ts` pasa a ser `precios-formula.ts`, del ERP. Se borran los dos scripts de
  sincronización con Bodega.
- `precios-ml-publicacion.ts` (nuevo): `precioDePublicacion({ ganancia, fabricacion, insumos,
  costos, politica })`. Arma unos `GastosVenta` con los costos reales de la publicación
  (`mlComisionPct` = % + recargo, `mlCuotasPct` = 0, cargo fijo del tramo, envío real o la regla
  del umbral) y llama a `precioMlConGanancia`. Como el cargo fijo depende del precio, prueba cada
  tramo y se queda con el que es consistente (el precio cae dentro de su tramo). Después redondea
  y aplica la promo, como `tresPrecios`.
- **2026-10-30**: el precio es margen sobre el precio en los dos canales. `precioConMargen(g, canal)`
  generaliza `precioMl`; la web va sin piso mayorista (`precioConGanancia(..., conPiso = false)`).
  `descuentosParaMargen` da el descuento de cada tramo de la web para su meta (spec 009).
  `precioConPromo` no aplica la promo si el inflado cruza el techo del umbral (spec 003 RN-6), y
  `precios-ml-publicacion.ts` le pasa el techo del umbral general aunque la publicación tenga envío
  gratis. Ojo: `precioConPromo` lo usa también `tresPrecios`, así que la regla vale en la pantalla
  de hoy desde que se publique.
- La ganancia del producto se sigue calculando como hoy (margen objetivo sobre ML), pero con la
  comisión de la Clásica de la categoría del producto en lugar del promedio.

## 4. Lectura de ML

`leerPreciosMl()` suma, sin llamadas de más:

- `attributes` de `/items?ids=` con `listing_type_id,category_id,shipping,sale_terms`.
- `/users/{id}/shipping_options/free?item_id` sólo para las que tienen envío gratis.
- `/sites/MLA/listing_prices?price&category_id` una vez por categoría (devuelve todos los tipos).
- Los tramos del cargo fijo: se leen buscando los cortes con `listing_prices` en una categoría y
  se guardan en `tarifasMl`; se vuelven a leer si tienen más de un día.
- El recargo real por cuotas: se compara el cotizado con `sale_fee / unit_price` de las ventas de
  esa publicación (`/orders/{id}`) y se guarda el cobrado si hay ventas (spec 003, RN-4).

## 5. Endpoints y pantallas

| Qué | Dónde |
|---|---|
| Configuración | `GET/PUT /api/precios/configuracion`; pestaña "Configuración" en `/precios` |
| Política del producto | `PATCH /api/modelos/[id]/precio` (margen, promo, redondeo, categoría de ML); sección "Precio" en `/modelos/[id]` |
| Predictor | `GET /api/precios/categoria-ml?q=` (envuelve `domain_discovery`) |
| Filas de ML | `/api/precios` suma por fila tipo, cuotas, envío gratis y comisión; la pantalla lo muestra |
| Para publicar | `/api/precios` suma, por combinación sin publicaciones, los precios de Clásica, Premium y con envío gratis |

## 5b. Dos opciones y Flex (specs 006 y 007)

- `opcionesDeVenta(producto)` en `precios-ml-publicacion.ts`: precio de la opción 1 (RN-1) y de la
  opción 2 a partir de la ganancia real de la opción 1 ya redondeada (RN-2). Cada publicación se
  clasifica en 1 o 2 por tipo, cuotas y envío gratis; lo que no encaja se marca "otra".
- Crear la opción que falta (TASK-013, primero la verificación): para productos con variantes
  (User Products), una publicación por variante, con el mismo `user_product_id`, tipo, cuotas,
  envío y precio; vista previa y confirmación por tanda; registro en `cambios_precio` con canal
  `mercadolibre` y estado propio. Si la API no lo permite, sólo los precios para cargar a mano.
- Flex (TASK-015, primero la verificación): leer si cada publicación tiene Flex en la lectura de ML
  y prenderlo o apagarlo con el recurso que indique la doc; mismo registro.

## 6. Migración (una vez, script con modo de prueba)

`scripts/sdd-006-migrar-precios.ts`:
1. `config_precios` desde `bodega.cost_settings.gastos_venta`, con `mlPromoPct` = 10.
2. Política de las piezas con margen, promo o redondeo propios → al producto que las usa (spec
   002, RN-1). Lo que no cierra va a una lista.
3. `categoria_ml` de cada producto con publicaciones.
4. Compara, para cada combinación, el precio antes y después, y lo deja en un informe.

## 7. Orden de publicación

1. ERP: tablas, migración, lectura de ML, fórmula por publicación, pantallas. El ERP deja de leer
   `gastos_venta` y la política de `bodega.*`.
2. Bodega (spec 005): calculadora sólo de costos, ficha sin precios, sync sin `gastos_venta` ni
   política. Release con el procedimiento de siempre.
3. Recién después, si nada las lee, se pueden borrar las columnas viejas de `bodega.*`.

## 8. Pruebas

- `scripts/sdd-006-probar-precios.ts`: la fórmula por publicación (Clásica, Premium, envío gratis,
  cada tramo de cargo fijo), la elección del tramo y la herencia de categoría.
- El informe de la migración: ningún precio de la web ni de personalizados cambia (spec 001,
  CA-1).
- CA-1 de la spec 003 con el Angel, con datos reales.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Los precios de ML suben de golpe al usar la comisión real | El informe de la migración los muestra antes; Aplicar sigue pidiendo confirmación y aparte lo que cambia más de 30 % |
| ML cambia la tarifa | Se lee de ML con fecha; la fila dice con qué tarifa se calculó |
| El recargo por cuotas cotizado no es el cobrado | Se usa el cobrado en ventas reales cuando lo hay (spec 003, RN-4) |
| Bodega publica antes que el ERP | Orden de la sección 7 |

## 10. Documentación

- `INV - Flujos` sección 10 (Precios), `BOD - Flujos` (la calculadora) y `Flujos del ecosistema`
  contrato 3 (Bodega → ERP ya no lleva gastos ni precios). `INV - Backlog` y `BOD - Backlog`.
