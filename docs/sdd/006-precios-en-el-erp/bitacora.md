---
feature: 006-precios-en-el-erp
---

# Bitácora · Precios en el ERP

Diario de sesiones. Lo último arriba de cada día; los días en orden.

---

## 2026-10-29 · Claude (sesión del inventario) — SDD

- Origen: la promo general de ML de Bodega estaba en 18,9 % (2026-10-28) y el Soporte de Auricular
  Angel se publicó caro; después, el Angel Premium (cuotas y envío gratis) recibía de Precios el
  precio de la Clásica. Agustín: "el cálculo de precio debería estar en el ERP y que la bodega solo
  mande la hora que tarda el modelo, gramos e insumos".
- Decisiones de Agustín (2026-10-28): promo general 10 %; parámetros de la máquina y materiales
  quedan en Bodega; las dos mejoras de ML (precio por publicación y comisión real) van acá.
- Verificado en ML, sólo leyendo: `listing_prices` sin tipo devuelve todos los tipos; cargo fijo
  por tramos (menos de $15.000, $1.330; hasta $24.000, $2.740; hasta $33.000, $3.320; después $0),
  igual en las dos categorías probadas; % de 13,5 a 16 en las 23 categorías de la cuenta; recargo
  de Premium 12,9 % en el cotizador; envío gratis del Angel $10.790; el predictor
  (`domain_discovery`) a veces elige otra categoría que la que usa Sendero (katanas: "Katanas" 16 %
  contra "Espadas" 14 %).
- SDD en draft, para validar.
- Validado por Agustín ("Dale"), con dos agregados del mismo día:
  - Todo producto con dos opciones de venta en ML: opción 1 sin cuotas (envío a cargo del
    comprador debajo de $30.000) y opción 2 con 3 cuotas sin interés y envío gratis, más cara para
    dejar la misma plata; desde $30.000, las dos con envío gratis. Spec 006. Crear la opción que
    falta depende de que la API de ML lo permita para User Products: se verifica primero.
  - Prender y apagar Flex desde el ERP. Spec 007, también con verificación primero.
- **Recargo por 3 cuotas (TASK-004, investigación):** en las ventas reales de Premium con
  `INSTALLMENTS_CAMPAIGN = 3x_campaign`, ML cobró **% de la categoría + 8,5 %** (Angel: 40.941 ×
  24 %; MLA2219798950: 52.041 × 23 %; las de $10.925: 16 % + $1.330 + 8,5 %). El cotizador
  (`listing_prices` con `gold_pro`) dice 12,9 % para todas: no sirve para la Premium con campaña
  de 3 cuotas. Agustín tenía 8,9 %. Dos casos no cierran exacto (un producto de $127.737 dio
  +8,07 % y uno de $3.610, +9,6 %): por eso se usa lo cobrado por publicación cuando hay ventas, y
  8,5 % cuando no.
- **El cargo fijo pesa en lo barato:** vaso K4os a $18.990, ML cobró $5.465 (14,35 % + $2.740 =
  28,8 %); Bodega calculaba $3.199. Collar K4os a $7.600: 33,5 %.
- Agustín pidió además que un producto nuevo quede creado en ML, pausado, con lo mínimo, enlazado y
  con precios, para terminarlo él en ML (spec 008). Propuesta: un botón por producto en vez de
  automático con cada pieza de Bodega (Bodega da de alta pruebas e insumos). Queda la pregunta
  abierta.
- TASK-001 hecha: `prisma/sql/precios-en-el-erp.sql` aplicado (aditivo) y schema regenerado. El
  motor de Prisma estaba tomado por los dos procesos del MCP de publicidad (sesiones de Claude
  Code abiertas): se renombró el viejo (`query_engine-windows.dll.node.viejo-*`) para poder
  generar sin cortarlos. Borrarlo cuando no haya MCP corriendo.

## 2026-10-30 · Claude (sesión del inventario) — el margen

- Primera versión del precio por publicación: recalculaba el margen sobre ML con la comisión real y
  subía la ganancia y la web (el Angel a $51.490). Se pasó a dejar fija la ganancia de hoy.
- Agustín pidió los porta auriculares en $29.434 (no cruzar los $30.000): columna
  `modelos.precio_ml_fijo`, cargada en los cuatro; `opcionUnoFija` mide lo que dejan (Angel 26 %,
  Nube 34 %, AC/DC 44 %, Demonio 22 %).
- Agustín: "el % de ganancia está medido en el precio de fabricación". Con 50 % sobre la impresión
  los precios caían a la mitad (hoy la ganancia equivale a ~270 % sobre la impresión). Le pasó un
  documento de cotización con margen sobre el precio de venta (precio = costo total / (1 − gastos −
  margen)); eligió margen sobre el precio, **35 %**. Simulado con la comisión real: de 36 Clásicas,
  15 suben, 15 bajan, 6 igual, mediana +1 %. `opcionUnoConMargen` en
  `precios-ml-publicacion.ts`. Arriba de $30.000 el envío se recupera sin pedirle margen (regla de
  siempre), así que esos productos quedan en ~25 % (la Shinobu, la Yamato).
- Pendientes que trae el documento: mano de obra por hora (Bodega), embalaje como insumo, mostrar
  margen y markup juntos con el desglose.

## 2026-10-30 · Claude (sesión del inventario) — la web, los tramos y la promo

- Agustín: 35 % en la web y en ML; los tramos de la web tienen que dejar 5 u 30 %, 10 u 25 %, 20 u
  20 %; y si la promo de 10 % publica un producto arriba de $30.000, no se aplica.
- Fórmula: `precioConMargen(g, canal)` generaliza `precioMl` (que ahora lo llama);
  `precioConGanancia` tiene `conPiso` (por defecto, la web como siempre); `descuentosParaMargen` y
  `METAS_MAYORISTA_WEB` (spec 009). `precioConPromo`: si el inflado pasa el techo del umbral, se
  publica sin promo (antes se bajaba el publicado hasta el techo y el cliente pagaba menos de lo
  calculado). Lo usa también `tresPrecios`: cambia la pantalla de hoy cuando se publique. Con la
  promo de 18,9 % de Bodega, a la Caja Figuritas le pasa: $26.890 en vez de $33.157.
- El Shop tiene un solo juego de tramos para toda la web (`configuracion.descuento_tramos` =
  "5:10, 10:20, 20:30") y envío gratis desde $34.000 por carrito. Bodega tiene
  `webEnvioGratisDesde` = 0, que la fórmula lee como "el envío lo pagamos siempre": la
  configuración nueva va con 34.000 (spec 001).
- Con gastos sólo porcentuales (10,6 % en la web) los tramos serían 8 / 15 / 21 % para todos. El
  envío gratis los rompe: el pedido de 5 u pasa los $34.000 en 39 de 58 productos y los $6.315 se
  comen el margen; para que todos lleguen, 0 / 0 / 4 %. Si los pedidos por cantidad pagan el envío,
  8 / 15 / 21 % llega en los 58. Queda como pregunta abierta para Agustín (spec 009).
- `scripts/sdd-006-probar-precios.ts` (nuevo, puro): 26 de 26. `sdd-003-probar-precios.ts`: 16 de
  63 fallan; 15 ya fallaban antes de este cambio (la web del ERP no coincide con las fotos que
  guardó Bodega entre el 22 y el 28/10: Bodega cambió sus gastos de la web después) y la 16 es la
  Caja Figuritas por la regla nueva de la promo. Se ajustó la prueba del pack de 10 en ML a la regla.
- Informe regenerado (`informe-2026-10-30.md`): ML y web al 35 %, tramos por producto, 4 productos
  sin promo por el umbral (Sanemi 65 y Zenitsu 65 sin funda, Tateti, Tokito 95 sin funda).

## 2026-10-30 · Claude (sesión del inventario) — envío en la web, mapeos y avisos de promo

- Agustín: **envío gratis siempre en la web**, con el envío promedio ($6.315; paga entre $4.000 y
  $11.000) adentro de cada precio, sin margen. Es lo que ya tenía Bodega (umbral 0); se volvió a 0
  la idea de pasarlo a $34.000. `precioConMargen` no busca "quedarse abajo" con umbral 0. Con eso,
  los tramos que dejan la meta en los 58 productos son **16 / 25 / 31 %** (manda la Yamato 95 con
  funda); los de hoy (10 / 20 / 30) ya cumplen en todos. En el Shop, `envio_gratis_desde` = 1
  funciona pero dice "desde $1": va a la sesión del Shop (spec 009).
- Agustín confirmó la regla de la promo: si el producto ya pasa los $30.000 con su margen, la promo
  se aplica (así funcionaba: el techo sólo existe debajo del umbral).
- **Mapeos**: 125 publicaciones de ML que nunca vendieron quedaron mapeadas a mano (112 a sus
  combinaciones, 13 de Shay descartadas, `origen = manual`). Sin mapear quedaron 14 sin producto en
  el ERP o dudosas: Link de pago, nombre personalizado, Zoro Shusui (95 y mini), minis de Zoro
  Kitetsu/Enma, Law, Nier, Rivers of Blood, Ichigo 20 cm, Tanjiro 95 y 65 sin versión, Inosuke
  "2 katanas". Tanjiro V1 se tomó como "vieja" y V2 como "nueva". Los llaveros BT21 Rj, Shooky y
  Koya fueron a "Llavero BTS", como los otros cinco, aunque existen las combinaciones "Llavero BT21 ·
  …" sin mapear. "Leer precios de ML": 216 leídas, 0 errores (antes 103). Sin publicación quedan 5:
  Dumpling Clicker, Jabonera Ikigai, Kit Vaso + Llavero Suga, Saja Boys, tapa damian.
- **Avisos de promo** (spec 010): la API de promociones de ML da 403 también para leer
  (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`); falta el permiso funcional en la app. El aviso se arma
  con lo que ya se lee (standard contra sale_price). Prueba en el informe: 61 publicaciones; 50 con
  una campaña propia de 5–11 % que vence el 2026-11-08 contra el 10 % que supone el precio nuevo, y
  11 sin promo (algunas pausadas).

## 2026-10-30 · Claude (sesión del inventario) — envío gratis y tramos, decisión

- Agustín no quiere envío gratis siempre (encarece lo barato: +$7.000 por producto) sino desde un
  monto, para tentar a llevar dos. Investigado: umbral = ticket promedio + envío ÷ margen (≈ $46.000)
  o ticket + 20–30 % (≈ $32.000–35.000); el envío gratis se paga con un % en todos los precios. Con
  los 78 pedidos de la web (49 con envío), un umbral de $40.000 se habría llevado el 1,6 % de lo
  vendido.
- Con $40.000 y reserva de 3 % los pedidos por cantidad igual pasan el umbral, y ningún juego único
  de tramos cumple 30 / 25 / 20 (daba 0 / 4 / 10). Agustín eligió **tramos 8 / 12 / 18 %** con envío
  gratis, y la meta pasa a ser un piso: 18 / 17 / 14 % en el peor producto; mediana 26 / 26 / 23.
  Ninguno pierde plata.
- Código: `webEnvioReservaPct` (opcional) en `GastosVenta`, `precioWeb`, `TRAMOS_WEB` y
  `margenesDeTramos`; `descuentosParaMargen` queda con metas obligatorias. Informe: umbral y
  reserva por variable de entorno (`WEB_ENVIO_GRATIS_DESDE`, `WEB_ENVIO_RESERVA`). Pruebas 28 de 28.
- En el Shop no hace falta código: `envio_gratis_desde` = 40000 y `descuento_tramos` = "5:8, 10:12,
  20:18", en el panel.

- (2026-10-30, más tarde) Agustín habilitó el permiso de promociones y reconectó ML en el ERP: el
  token trae `urn:ml:mktp:offers:/read-write` y `/seller-promotions` ya contesta (14 campañas del
  vendedor y de ML; por publicación, la activa y las candidatas con precio sugerido). Spec 010
  actualizada (REQ-3 posible, REQ-4 a confirmar).
- (2026-10-30) Agustín resolvió las 14 sin mapear: el nombre personalizado es de Shay (ignorada);
  Tanjiro 95 y 65 sin versión = la nueva; "Inosuke 2 Katanas" = 2 × Inosuke 95 sin funda (unidades 2).
  El link de pago y las 9 que no tienen producto en el ERP quedan **sin mapear**, no ignoradas: una
  publicación ignorada descarta sus ventas (`itemsIgnorados` en `mercadolibre-sync.ts`); sin mapear,
  la venta llega a la cola. Ojo: MLA2765408434 (mismo título que la 65 nueva) está mapeada a mano a la
  Tanjiro **vieja** 65; se le preguntó a Agustín.
- (2026-10-30) Prueba de escritura de promos, pedida por Agustín con el Carrete (MLA3189980034): POST a
  "Q4" contestó 200 sin cambiar nada (ya estaba); PUT con `deal_price` 3420 lo pasó de 5 % a 10 %:
  `sale_price` = $3.420. Agustín quiere prender promos desde el ERP a mano y en cantidad, nunca solo
  (spec 010, REQ-4 a REQ-7).

## 2026-10-30 · Claude (sesión del inventario) — pantalla de promos

- Construida la spec 010 (Agustín: "dale arrancá con todo"):
  - Tablas `cambios_promos` y `promos_ml_lectura` (`prisma/sql/promos-ml.sql`, aplicadas; aditivas).
  - `src/lib/promos-ml-reglas.ts` (puro): normalizar lo de ML, promo activa y candidatas, qué supone
    el precio, avisos, precio para un % con los límites de ML, qué mandar (POST, PUT, DELETE) y si
    quedó. `scripts/sdd-006-probar-promos.ts`: 26 de 26.
  - `src/lib/promos-ml.ts`: leer de a tandas, resumen con lo que deja cada opción, vista previa y
    aplicar (relee ML, manda, verifica con `sale_price`, registra, vuelve a leer la publicación).
  - Endpoints `GET /api/promos`, `POST /api/promos/leer`, `POST /api/promos/cambios`,
    `GET /api/promos/historial`; página `/promos` (Avisos, Por campaña con selección en cantidad,
    Todas, Historial), en el menú al lado de Publicidad.
- Lectura real: 186 publicaciones activas, 0 errores (56 s de una vez, por eso las tandas de 60).
  Avisos: 79 con otro %, 76 que vencen en menos de 3 días ("Q44" termina el 31/10), 15 de más,
  12 sin campaña.
- La co-participación (SMART) trae `ref_id` (la oferta) y cuánto pone ML y cuánto el vendedor: una
  katana a 40 % menos, ML 2,4 % y Sendero 37,7 %. Se muestra y lo que deja se calcula con lo que
  entra de verdad.
- Probado en el navegador local: carga, pestañas, el menú de una fila, la vista previa de uno y de
  dos seleccionados (cancelados, no se mandó nada). Un error de Base UI (`DropdownMenuLabel` fuera
  de un `DropdownMenuGroup`) se corrigió.
- Vault: INV - Flujos (sección 12, menú, índice de endpoints y el nombre viejo de la fórmula en la
  sección 10), Flujos del ecosistema (contrato 6c), INV - Backlog. Mermaid validado (26 bloques).
- Nada commiteado ni desplegado.
- (2026-10-30, más tarde) Agustín mandó el primer cambio desde la pantalla: la Ichigo 95 con funda
  (MLA1651421029) sumada a "Q4" al 10 %. En ML quedó en "Q44" y "Q4" (ML aplica "Q44" hasta el
  31/10 y después "Q4" hasta el 7/11). Pagaba lo mismo en las dos, así que la verificación por
  `sale_price` no distinguía: ahora también mira la lista de promos (`quedoEnPromos`). 29 de 29.
- MLA2765408434 pasada de la Tanjiro vieja 65 a la nueva (Agustín). Agustín va a costear las 47
  combinaciones sin costo.

## 2026-10-30 · Claude (sesión del inventario) — el motor del ERP, con interruptor

- En producción el commit 8750fe1 (pantalla de Promos y todo lo de la 006 hasta acá).
- TASK-006 y el núcleo de TASK-008: `leerGastosDeVenta(tenantId)` lee `config_precios` si existe
  (`origen: "erp"`); si no, Bodega como siempre. Con `origen: "erp"`, `precioDeCombinacion` usa
  `tresPreciosErp` (opción 1 de ML con la comisión de la categoría o el precio fijo, web con
  `precioWeb`, personalizados con margen sobre el precio) y `precioDeClave` calcula cada
  publicación de ML con lo que cobra ML por ella; un pack de ML se calcula entero; un pack del Shop
  usa los tramos de la web. La política del producto sale de `modelos` del ERP; de Bodega se sigue
  tomando redondeo y promo de la pieza, no el margen.
- Sin la fila nada cambia: `sdd-003-probar-precios` da las mismas 16 fallas conocidas.
- `scripts/sdd-006-migrar.ts` (TASK-009), en modo de prueba: ML 36 suben y 54 bajan respecto de lo
  que propone Precios hoy; **la web baja en todos los productos, mucho** (collar $12.490 → $2.790,
  bola de JoJo's $22.290 → $8.190, Yamato sin funda $48.890 → $29.290). Con margen 35 % sobre el
  precio y 13,6 % de gastos, una venta en la web deja un tercio de los pesos que deja en ML. Antes
  (SDD 003) la web dejaba los mismos pesos que ML. **No se aplicó: lo decide Agustín.**
