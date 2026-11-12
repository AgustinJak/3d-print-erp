---
feature: 010-segunda-cuenta-ml
---

# Bitácora 010

## 2026-11-12 · Claude (sesión del inventario)

**Pedido.** Agustín quiere una segunda cuenta de ML, Sendero Shop, con los mismos productos que Sendero
3D, manejada desde el ERP, y un publicador que copie todo de la principal.

**Lo que se miró.** `cuentas_ml` admite una cuenta por tenant, y 15 archivos llaman a ML con esa
cuenta. El webhook ya resuelve la cuenta por `user_id` y los MLA no chocan entre cuentas.

**Riesgo planteado antes de diseñar.** No hay texto oficial de ML Argentina para este caso; fuentes de
terceros hablan de baja automática de publicaciones idénticas entre cuentas y de suspensión por
cuentas duplicadas. Agustín cree que ML lo permite: Sendero Shop va a estar a su nombre y la principal
a nombre de Tai, y acepta hacer variantes de fotos y textos.

**Decisiones del 2026-11-12:** mismos precios; Finanzas separada y sumada; títulos y descripciones
propios; copiar por tandas elegidas.

**Una aclaración de diseño.** El copiador exige fotos y textos propios y avisa si son idénticos, pero no
modifica fotos automáticamente para esquivar la detección de duplicados de ML: las variantes salen de
las skills de fotos y textos de producto.

**Cambio de decisión, el mismo día.** Agustín: las fotos van iguales ("ya vi que muchos lo hacen") y
el título cambia en su última parte. La descripción va igual. El copiador sólo exige que el título no
sea idéntico.

## 2026-11-12 · Claude (sesión del inventario), más tarde

**Tareas:** TASK-001 y TASK-002 (completed), TASK-003 (in-progress).

**Qué se hizo.** La migración va en dos pasos: el código desplegado hasta hoy guarda los tokens con un
upsert por `tenant_id`, y sin esa restricción única no podría renovar el token. Paso 1 aplicado
(columnas e índices, Sendero 3D quedó principal con nombre). El paso 2 se aplica después de desplegar.
`filaDeCuenta` nunca cae en otra cuenta cuando se pide la principal: si se desconectara la principal
con otras conectadas, lo de siempre usaría el token de Sendero Shop. Por eso la principal sólo se
desconecta si no quedan otras. El nickname de una cuenta nueva se pide con su propio token
(`usuarioDelToken`), no con el de la principal.

**Cómo se probó.** Con la cuenta real: la principal sin cuenta y por id dan el mismo token y la misma
cuenta en ML; una cuenta inexistente da null; el `state` firma los dos modos, uno viejo sigue valiendo y
uno adulterado no. 41/41 pruebas de precios.

## 2026-11-12 · Claude, TASK-003 y TASK-004

Agustín conectó la segunda cuenta: el apodo de ML es SENDERODELOSSUENOS; en el ERP se llama Sendero
Shop (`cuentas_ml.nombre`).

**Cada publicación con su cuenta.** `mapeos_canal.cuenta_ml_id`, con restricción a `cuentas_ml` y sin
borrado en cascada: una cuenta con publicaciones enlazadas no se desconecta. En vez de tocar cada
llamada, `mlFetch` reconoce la publicación en la ruta (`/items/MLA…`, sus promos, su Flex) y usa la
cuenta de esa publicación, con un minuto de memoria. Lo que no lleva la publicación en la ruta va
explícito: la lectura de precios en tanda (`/items?ids=`), la automatización de precios y el costo
del envío gratis por usuario. Lo de toda la cuenta sigue siendo de la principal: la lista de campañas
de Promos, las tarifas y la publicidad.

**Probado.** Sendero Shop responde con su token; una publicación de Sendero 3D sigue yendo a la
principal; la lectura completa de precios leyó 227 publicaciones en 92 s sin errores ni cambios.
Todavía no hay publicaciones de Sendero Shop para probar el camino con la otra cuenta: llega con el
copiador.

## 2026-11-12 · Claude, TASK-005

**Las ventas de las dos cuentas.** El camino de una venta pasa por unas 40 llamadas a ML en
`mercadolibre-sync.ts` (1.100 líneas). En vez de pasar la cuenta por cada una, `conCuentaMl(cuenta, fn)`
la deja "en curso" con `AsyncLocalStorage`, y `filaDeCuenta` y `mlFetch` la usan cuando no se pide
otra. Orden en `mlFetch`: la cuenta pedida, la en curso, la de la publicación en la ruta, la principal.

- El webhook procesa la venta de otra cuenta con esa cuenta en curso (antes la anotaba y no la
  procesaba).
- El pedido guarda `origen_externo.cuenta_ml` (null = principal) y lleva el nombre de la cuenta como
  etiqueta. Una clave nueva del mapeo que llega con esa venta queda con `cuenta_ml_id`.
- Liquidaciones: cada pasada sólo mira los pedidos de la cuenta en curso. El neto de Mercado Pago se
  relee con la cuenta de cada pedido.
- `porCadaCuentaMl` recorre las cuentas en el cron, "Sincronizar últimos 30 días" y "Actualizar
  liquidaciones".

**Probado.** La cuenta en curso no se escapa afuera ni se mezcla entre dos trabajos en paralelo. La
pasada del cron por cuenta: Sendero 3D con 17 compras de 2 días, 7 actualizadas y nada creado (lo de
siempre); Sendero Shop con 0 ventas.

**Queda para TASK-006:** las bonificaciones Flex (`sincronizarFlex`) y la facturación de Sendero Shop.

## 2026-11-12 · Claude, TASK-007

**El copiador.** En Productos, con variantes elegidas, "Copiar a Sendero Shop" lista sus publicaciones de
Sendero 3D. Cada una se vuelve a leer de ML al revisar y al crear: va igual que la original
(categoría, atributos, tipo, precio, stock, garantía, disponibilidad, envío, fotos en su versión
completa y descripción), con el título editado. La copia queda pausada y enlazada a la misma variante
con `cuenta_ml_id` de destino; el mapeo guarda `muestra.copiaDe`, así una publicación no se copia dos
veces. Un error después de crear no corta la vuelta: se avisa, como en Crear en ML.

**Lo que dijo ML con `/items/validate` en la cuenta nueva** (sin crear nada): usa User Products, pide
`family_name` y rechaza `title`. Con eso contesta sólo avisos ("User has not mode me1", "Mandatory free
shipping added", y atributos que no deja tocar: PACKAGE_*, SYI_PYMES_ID, GIFTABLE, IS_HIGHLIGHT_BRAND,
IS_TOM_BRAND, que ya no se mandan). De las 226 publicaciones mapeadas de Sendero 3D, ninguna tiene
variaciones y 11 son de catálogo; la Horda, de catálogo, pasó la revisión.

**Probado.** Contra ML, sólo revisando: Horda y Bola de JOJOS con el final cambiado, aceptadas; AC/DC con
el título igual, rechazada antes de mandarla. La pantalla, con respuestas simuladas. 11 pruebas del
título (`scripts/sdd-010-probar-copia.ts`). La primera copia real la elige Agustín.
