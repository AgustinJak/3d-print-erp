---
feature: 017-etiquetas-desde-ml
estado: validated
actualizado: 2026-11-20
---

# SDD técnico · Etiquetas de Mercado Libre desde la Bodega

## 1. Estado actual

### Bodega: `Bodega/Bodega3D-App/src/main/etiquetas.ts`

- **Imprime un archivo ZPL** con `resources/Enviar-ZPL.ps1` (RAW a la HPRT HD700, 203 dpi), pasándole `-Archivo`.
  - `enviarArchivo` (línea 433) arma los argumentos y clasifica errores.
  - `filtrarZpl` (línea 190) separa Flex de normales y deja pegados los bloques de control de ML (`^XA^MCY^XZ`).
  - `medirZpl` (línea 217) mide el dibujo sin leer los `^FD`.
- **Para imprimir una parte** escribe un temporal en `tmpdir()` y lo borra en un `finally` (líneas 420-430). Es el patrón a reusar.
- **Historial:** `label_prints` (sólo metadata).
- **Los archivos salen de Descargas** (`buscarCandidatos`, línea 313) o de `labels:pick`.
- **Pantalla:** `src/renderer/src/pages/Etiquetas.tsx`.

### ERP: lo que ya se sabe de cada envío

- `resolverFechasEnvio` (`src/lib/mercadolibre-sync.ts:800`) recorre los envíos de cada pedido de ML (`orders[].shipping.id`) y calcula:
  - **despacho:** el SLA, `/shipments/{id}/sla`, y en `manufacturing` el día en que ML libera la etiqueta;
  - **esFlex:** `logistic_type === "self_service"`;
  - **enviado:** `envioYaSalio`.
- Lo guarda en `Pedido.fechaEntrega` y `origenExterno.fecha_despacho_ml` (líneas 463 y 486).
- `getShipment` (`src/lib/mercadolibre.ts:498`) y `mlFetch` con el token de cada cuenta (docs/sdd/010).

### Autenticación

- La Bodega **nunca llamó al ERP por HTTP**: sólo usa Supabase (REST y RPC) con su sesión.
- El middleware del ERP (`src/middleware.ts`) manda a `/login` todo lo que no traiga cookie de sesión, salvo webhooks, cron y el callback de OAuth.
- Un pedido de la Bodega con `Authorization: Bearer` hoy terminaría en un redirect.

## 2. Modelo de datos

**ERP:** nada nuevo. La lista sale de `pedidos` (canal ML, no entregados ni cancelados) y del envío leído en el momento.

**Bodega, SQLite:**
```sql
ALTER TABLE label_prints ADD COLUMN envioId TEXT;   -- el número de envío de ML, sin datos del comprador
ALTER TABLE label_prints ADD COLUMN flex INTEGER;   -- 0/1
```
Una fila por envío impreso desde la lista; las de archivo, como hoy.

## 3. Endpoints (ERP)

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/bodega/envios` | Envíos de ML para despachar. Por cada uno: pedido, número de venta, `envioId`, `flex`, `despacho` (fecha y hora límite), `estado` (`lista` / `impresa` / `en_fabricacion` / `salio`) y los productos del pedido del ERP, sin comprador |
| GET | `/api/bodega/etiquetas?envios=1,2,3` | El ZPL de esos envíos (`GET /shipment_labels?shipment_ids=…&response_type=zpl2`, de a 50, con el token de la cuenta Sendero 3D). Descomprime el ZIP de ML, toma el `.txt` y lo devuelve como `text/plain` con `Cache-Control: no-store` |

**Autenticación de los dos endpoints:**
- `/api/bodega/` pasa el middleware sin cookie, como `/api/cron/`.
- Adentro se valida `Authorization: Bearer <access token de Supabase>` con `supabase.auth.getUser(token)`, y el usuario tiene que ser de `sendero3d` (`perfiles`). Si no, 401 o 403.
- Lo hace `getTenantDeBodega()` en `lib/tenant.ts`.
- `/api/bodega/altas` y `/api/bodega/piezas` hoy usan cookie: se les suma el Bearer, o se deja el bypass sólo para las rutas nuevas (`/api/bodega/envios` y `/api/bodega/etiquetas`). Lo segundo es más acotado.

**El estado de cada envío**, leído en el momento con `GET /shipments/{id}`:

| Estado | Cuándo |
|---|---|
| `lista` | `ready_to_ship` / `ready_to_print` |
| `impresa` | `ready_to_ship` / `printed` |
| `en_fabricacion` | `manufacturing` (a pedido); se muestra cuándo la libera ML |
| `salio` | `envioYaSalio`; no se lista |

Con 20 a 40 pedidos abiertos son 20 a 40 consultas a ML, en paralelo de a 5. `/shipments` admite multiget en algunos sitios; se prueba en la TASK-001.

## 4. Bodega

| Pieza | Cambio |
|---|---|
| `src/main/etiquetas-erp.ts` (nuevo) | `envios()`: `GET /api/bodega/envios` con `ensureToken()` de `sync.ts`. `imprimirEnvios(ids, flexPrimero)`: pide el ZPL y lo imprime con `enviarArchivo` sobre un temporal que se borra siempre; anota `label_prints` |
| IPC nuevos | `labels:envios` (la lista) y `labels:imprimirEnvios` (ids y opciones). Se documentan en BOD - Flujos |
| `Etiquetas.tsx` | "Para despachar" arriba: resumen, lista por día, Imprimir las de hoy, sólo Flex, una o reimprimir. Los archivos de Descargas abajo, como respaldo |
| La URL del ERP | La misma que `erp:abrir` (`https://3d-print-erp.vercel.app`), en una constante compartida |

Sin conexión o con el ERP caído, la sección dice "No se pudo leer Mercado Libre" y queda lo de Descargas (RN-4).

## 5. Integraciones externas

| Llamada | Para qué | Si falla |
|---|---|---|
| ML `GET /shipments/{id}` | El estado de la etiqueta | Ese envío sale "sin estado", sin botón de imprimir |
| ML `GET /shipment_labels?shipment_ids=…&response_type=zpl2` | El ZPL, en un ZIP con un `.txt` (y a veces un PDF de resumen) | Error claro; queda el camino de Descargas |

**A confirmar en la TASK-001** (la documentación es vieja o contradictoria):
- que `zpl2` devuelve el ZIP con el `.txt` en Argentina;
- que el ZPL trae el **troquel** de la cuenta ("Imprimir troquel" prendido);
- que las **Flex** tienen etiqueta por este recurso (una fuente de la comunidad dice que no);
- que bajarla pasa el subestado a `printed`;
- y que las medidas coinciden con las de la web.

## 6. Seguridad

- **Las etiquetas traen datos personales del comprador** (nombre, documento, dirección).
  - El ERP no las guarda, no las loguea (ni en `console.error`) y responde con `no-store`.
  - La Bodega no las escribe salvo en el temporal del script, que se borra en un `finally`.
- **El Bearer es el access token de Supabase de la sesión de la Bodega:** dura una hora y se renueva con el refresh que ya maneja `sync.ts`. No hay claves nuevas.
- **Sólo usuarios de `sendero3d`.** La cuenta demo y cualquier otro negocio reciben 403.
- **Límite de envíos:** `/api/bodega/etiquetas` acepta sólo envíos de pedidos del ERP de ese negocio (se cruza `envioId` con `pedidos`). No sirve para bajar etiquetas de otro vendedor.

## 7. Pruebas

| Prueba | Qué cubre |
|---|---|
| TASK-001, con un envío real y el OK de Agustín | Formato, troquel, Flex, `printed` y medidas, comparando con el archivo de la web |
| `scripts/sdd-017-probar-envios.ts` | La lista contra la base y ML, sólo lectura: estados y fechas, y que no viaje ningún dato del comprador |
| Bodega | Que el temporal se borra aunque falle la impresión, y que sin ERP queda Descargas |

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La API no trae el troquel | Se decide con Agustín antes de seguir (TASK-001): si no lo trae, el camino de la web sigue siendo el principal para esas |
| Las Flex no salen por la API | Las Flex siguen por Descargas y la API hace las normales; la lista igual sirve |
| Imprimir dos veces la misma tanda | Se ve "impresa" (de ML) y el botón pasa a "Reimprimir", con confirmación |
| El token de la Bodega vence a mitad de camino | `ensureToken()` renueva, como en la sincronización |

## 9. Documentación a actualizar

- [ ] `INV - Flujos`: endpoints nuevos, bypass del middleware, sección nueva.
- [ ] `BOD - Flujos`: IPC nuevos, la sección de etiquetas.
- [ ] `Flujos del ecosistema`: contrato nuevo, **Bodega → ERP por HTTP**, y el de ML `shipment_labels`.
