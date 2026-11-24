---
feature: 018-reparto-con-mensajeria
estado: validated
actualizado: 2026-11-23
---

# SDD técnico · Reparto con mensajería

## 1. Estado actual

- **Flex:** `enviosParaDespachar()` (`src/lib/envios-para-despachar.ts`, SDD 017) trae los envíos de ML de la cuenta Sendero 3D sin despachar, con Flex, hora límite y productos.
  - La dirección no está en el ERP: viene en `GET /shipments/{id}` (`receiver_address`).
  - Probado el 2026-11-23 sobre 5 Flex: trae `state`, `city` (la localidad), `neighborhood` y `zip_code`; `municipality` vino siempre vacío. Por ejemplo "Plátanos 1861", "Florida Oeste 1604", "Benavidez 1621", "Capital Federal / Villa Crespo".
- **Web:** los pedidos con `canal_venta = shop` y `metodo_envio = syb`, unos 4 por mes.
  - El webhook (`src/app/api/webhook/shop/pedido/route.ts:48-69`) recibe `direccion_envio` (calle, número, piso, depto, ciudad, provincia, cp, notas) y `costo_envio`.
  - Hoy la dirección se guarda formateada en `clientes.direccion` y sólo si estaba vacía (línea 420): un cliente que cambia de dirección queda con la vieja. Hay que guardarla también en el pedido (`origen_externo.direccion_envio`).
- **Las zonas de SyB ya existen en la web:** la tabla `envio_syb_zonas` (base de la web) tiene nombre, precio, partidos y localidades (`zonas[]`) y códigos postales (`codigos_postales`, "1000-1499, 1602").
  - La lógica está en `Shop/sendero-shop/src/lib/envio-syb.ts`: `buscarZonaSyb` por municipio y `buscarZonaSybPorCP`.
  - La web no se toca (es de otra sesión); el ERP usa su propia copia (sección 2).
- **Bonificación Flex por envío:** `flex_ml` (SDD 007), con `envio_id`.

## 2. Modelo de datos

```sql
-- prisma/sql/reparto.sql — aditivo.
CREATE TABLE public.zonas_reparto (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL DEFAULT 'sendero3d',
  nombre text NOT NULL,              -- "CABA", "Zona 1", "Zona 2", "Zona 3"
  precio numeric NOT NULL,           -- lo que se le paga al repartidor por envío entregado
  partidos text[] NOT NULL DEFAULT '{}',     -- normalizados
  localidades text[] NOT NULL DEFAULT '{}',  -- las que el mapa nombra sueltas (Guernica, Korn, Tristán Suárez)
  codigos_postales text,             -- como en la web: "1000-1499, 1602"
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.hojas_reparto (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL DEFAULT 'sendero3d',
  dia date NOT NULL,                 -- día de despacho, hora argentina
  token_hash text NOT NULL UNIQUE,   -- sha256 del link; el link no se guarda
  vence timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.envios_reparto (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL DEFAULT 'sendero3d',
  hoja_id text NOT NULL REFERENCES public.hojas_reparto(id) ON DELETE CASCADE,
  pedido_id text NOT NULL REFERENCES public.pedidos(id),
  origen text NOT NULL,              -- 'flex' | 'web'
  envio_ml text,                     -- el número de envío de ML, si es Flex
  zona_id text REFERENCES public.zonas_reparto(id),
  precio numeric NOT NULL,           -- fijo al ofrecerlo (RN-2)
  estado text NOT NULL DEFAULT 'ofrecido',  -- ofrecido | tomado | rechazado | entregado | no_entregado
  motivo text,
  marcado_en timestamptz,
  liquidacion_id text,
  UNIQUE (pedido_id, hoja_id)
);

CREATE TABLE public.liquidaciones_reparto (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL DEFAULT 'sendero3d',
  desde date NOT NULL, hasta date NOT NULL,   -- lunes a domingo
  total numeric NOT NULL,
  pagado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);
-- RLS prendido y sin políticas: sólo el servidor.
```

**La siembra** copia las cuatro zonas de la imagen de SyB (2026-11-23) y los códigos postales de `envio_syb_zonas`. Se leen una vez de la base de la web (sólo lectura, como el contrato 7b) si su política lo permite; si no, se pegan a mano desde su admin.

**Las direcciones no se guardan en estas tablas** (RN-4): la de un Flex se lee de ML al abrir el link, y la de la web sale del pedido.

## 3. Endpoints

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/api/reparto/hoy` | ERP (sesión) | Flex del día (de `enviosParaDespachar`) y mensajería de la web, con zona y precio, y lo ya ofrecido |
| POST | `/api/reparto/hoja` | ERP | Crea o completa la hoja del día con los envíos tildados; devuelve el link una sola vez |
| PATCH | `/api/reparto/envios/[id]` | ERP | Zona o precio a mano; sacar un envío |
| GET | `/api/reparto/semanas` | ERP | Semanas: entregados por zona, total, cuánto te dejó, pagado |
| POST | `/api/reparto/liquidaciones` | ERP | Cierra la semana y la marca pagada |
| GET y PUT | `/api/reparto/zonas` | ERP | Tarifas |
| GET | `/api/reparto/hoja/[token]` | **Público** (bypass del middleware) | Lo que ve el repartidor: sus envíos de ese día con nombre, dirección y hora límite (sin el producto) |
| POST | `/api/reparto/hoja/[token]/envios/[id]` | **Público** | `{ estado: tomado | rechazado | entregado | no_entregado, motivo? }` |

Las dos rutas públicas validan:
- el token: `sha256` contra `hojas_reparto.token_hash` y que no esté vencido;
- que el envío sea de esa hoja.

Tienen un límite de pedidos por minuto.

## 4. Páginas

| Ruta | Notas |
|---|---|
| `src/app/(app)/reparto/page.tsx` | Hoy, Semanas y Tarifas, con el estilo de Precios y Tendencias |
| `src/app/reparto/[token]/page.tsx` | **Fuera de `(app)`**: sin menú lateral ni sesión. **Móvil primero**: una columna, botones de 48 px o más, nada en hover, texto de 16 px, y "Lo llevo" o "No lo llevo" con el pulgar. Los cambios se guardan y se reintentan si no hay señal |

## 5. Zona de una dirección (`lib/zonas-reparto.ts`, puro)

1. Provincia "Capital Federal" o "CABA": CABA.
2. Localidad suelta del mapa (Guernica, Korn, Tristán Suárez): su zona.
3. Código postal dentro de los rangos de una zona.
4. Localidad o partido por nombre normalizado, como `buscarZonaSyb` de la web.
5. Si no se resuelve: "sin zona", y se elige a mano.

**La Matanza:** el mapa la parte entre las zonas 1 y 2. Va por localidad o código postal: San Justo, Ramos Mejía, Lomas del Mirador, Tapiales y La Tablada en la 1; González Catán, Laferrere, Isidro Casanova y Virrey del Pino en la 2. Se valida con Agustín, y si no se resuelve queda a mano (RN-3).

## 6. Seguridad

- El link es un token de 32 bytes aleatorios. Se guarda sólo su hash, vence a las 48 h y es uno por día.
- La página pública devuelve sólo los envíos de esa hoja y sólo nombre, dirección y la hora (el producto no, desde el 2026-11-23): nada de precios de venta ni otros pedidos.
- Las direcciones de los Flex se leen de ML con el token del ERP en el servidor y se mandan en la respuesta. No quedan en la base ni en logs.
- La ruta pública no cambia nada fuera de `envios_reparto.estado`.

## 7. Pruebas

| Script | Qué prueba |
|---|---|
| `scripts/sdd-018-probar-zonas.ts` | La zona de direcciones reales de Flex y de la web (sin mostrarlas), y casos de La Matanza |
| `scripts/sdd-018-probar-hoja.ts` | Un día de prueba: crear la hoja, que el token vence, marcar con el token y rechazar otro token. Se borra al terminar |
| Liquidación | Una semana armada con datos de prueba: total por zona, que no entregados no suman, y "cuánto te dejó" |

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Zona mal resuelta (CP de borde, La Matanza) | Se ve en la hoja y se corrige a mano; el precio queda fijo en el envío |
| El link llega a otra persona | Vence a las 48 h, ve sólo ese día y sólo lo necesario para entregar |
| El repartidor marca "Entregado" sin entregar | Para los Flex, ML confirma con su app; se puede cruzar con el estado del envío en ML (`delivered`) en la liquidación |

## 9. Documentación a actualizar

- [ ] `INV - Flujos`: sección nueva, endpoints, la ruta pública y su bypass.
- [ ] `Flujos del ecosistema`: el webhook de la web ahora guarda `direccion_envio` en el pedido (el contrato 1 no cambia, sólo lo que hace el ERP).
