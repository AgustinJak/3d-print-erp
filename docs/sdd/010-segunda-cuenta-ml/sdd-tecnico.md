---
id: 010
feature: segunda-cuenta-ml
estado: draft
creado: 2026-11-12
---

# 010 · Técnico

## Lo que hay hoy

- `cuentas_ml` tiene `tenant_id` **único**: una cuenta por negocio.
- `mlFetch`, `getMlAccount` y `getValidAccessToken` (`src/lib/mercadolibre.ts`) reciben sólo el
  tenant y buscan esa cuenta. Los usan 15 archivos: precios, Flex, promos, crear en ML, publicidad,
  facturación, neto de cada venta (Mercado Pago), tarifas, categorías, mapeo y sincronización.
- El webhook resuelve la cuenta por `user_id` (ya sirve para dos). Los crons recorren
  `cuentas_ml.findMany()` por tenant.
- `mapeos_canal` de ML: la clave es `<MLA>|<variación>`. Los MLA son únicos en todo ML, así que no
  chocan entre cuentas.

## Cambios

1. **Cuentas.** `cuentas_ml`: se saca el único por tenant y se agregan `nombre` ("Sendero 3D",
   "Sendero Shop") y `principal` (una por tenant). Migración SQL: la cuenta de hoy queda principal.
2. **Llamadas a ML.** `mlFetch(tenantId, path, init, { cuenta })`: sin cuenta, la principal (RN-2,
   nada cambia para lo de hoy). `getMlAccount` y `getValidAccessToken` igual. La renovación del token
   es por cuenta.
3. **Conectar.** El OAuth lleva en el `state` firmado si es la principal o una nueva; el callback crea
   o actualiza esa cuenta por `ml_user_id`. Integraciones muestra las dos.
4. **Publicaciones.** `mapeos_canal.cuenta_ml_id` (null = principal). La lectura de precios, aplicar,
   Flex, promos y crear en ML usan la cuenta de la publicación.
5. **Ventas.** El webhook y la sincronización por cuenta; el pedido guarda la cuenta
   (`origen_externo.cuenta_ml`). El neto de Mercado Pago se lee con el token de esa cuenta.
6. **Facturación y Finanzas.** `cargos_ml`, `periodos_ml` y `flex_ml` con `cuenta_ml_id`. Finanzas
   agrupa por cuenta y suma. Shay (campañas, percepciones, reparto) sólo con la principal.
7. **Copiador.** `src/lib/copiar-ml.ts`: lee la publicación de origen (`/items/{id}`,
   `/items/{id}/description`) y arma el borrador para la cuenta nueva. Las fotos van con la dirección
   de las de origen como `source` (versión completa), así ML las baja para la cuenta nueva. La
   descripción va igual. El título se edita en la pantalla y se compara con el original (RN-4). Revisa
   con `/items/validate` y crea pausada con el token de Sendero Shop. Mapea el MLA nuevo a la misma
   combinación con `cuenta_ml_id`.

## Orden

Primero 1 a 3 sin la cuenta nueva conectada: con una sola cuenta, todo tiene que andar igual que hoy
(se prueba con las pruebas de precios y una lectura de precios real). Después se conecta Sendero Shop,
y recién ahí 4 a 7.
