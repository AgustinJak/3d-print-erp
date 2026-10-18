---
feature: 001-mapeo-de-productos
estado: validated
actualizado: 2026-10-18
---

# SDD técnico · Mapeo de productos entre sistemas

El inventario es Next.js (App Router) + Prisma sobre la base de producción: las páginas son
client components que piden todo a `/api/*`, y los cambios de base van como SQL aditivo en
`prisma/sql/` (no hay `prisma migrate`).

## 1. Estado actual
- **Línea de pedido:** `ItemPedido` guarda `modeloId` (opcional desde el 2026-10-18),
  `descripcion` y `variantesInfo` (JSON libre) (`prisma/schema.prisma:190`). Al 2026-10-18 hay al
  menos seis formas de ese JSON (ver el cerebro, `Mapeo de productos`).
- **Reparto:** `componentesDeItem` lee de `variantesInfo` las entradas con `matched` +
  `varianteId` (`src/lib/reservas.ts:199`); la pieza sale por `stock.clave` = `<modeloId>|<ids de
  variantes que afectan stock>` y los insumos por `reglas_insumo` (`:242`). Lo usan
  `reasignarReservas` (`:294`) y `coberturaDePedidos` (`:606`).
- **ML:** `publicaciones_ml` mapea MLA → modelo, con `variantes_implicitas`
  (`prisma/schema.prisma:360`); el sync busca los atributos de la variación por nombre
  (`src/lib/mercadolibre-sync.ts:462`) y aplica las implícitas (`:473`). La orden trae
  `variation_id` (`src/lib/mercadolibre.ts:256`), que hoy no se guarda.
- **Shop:** el webhook busca el modelo por SKU y si no por nombre exacto, las opciones por nombre
  normalizado (`src/app/api/webhook/shop/pedido/route.ts:491-600`), y redirige las katanas
  partidas con `resolverModeloPorTamano` (`:29`). El Shop tiene `opcion_id` en sus pedidos pero no
  lo manda (`Shop/sendero-shop/src/lib/inventario-payload.ts:45`).
- **Carga manual:** el diálogo elige modelo + casillas de variantes
  (`src/app/(app)/pedidos/pedido-dialog.tsx`); desde la fase 0 conserva `varianteId` y `matched`
  (`src/lib/variantes-item.ts`).
- **SKU:** `src/lib/sku.ts` genera `SS-<LINEA>-<CATEGORIA>-<NNN>` por modelo (`:51`); 81 de 92
  modelos activos lo tienen.
- **Filas de stock:** `asegurarFilasDeStock` crea una por combinación de variantes que afectan
  stock (`src/lib/stock-filas.ts:17`); 89 de 92 modelos activos tienen una sola.
- **Recetas:** `reglas_insumo` (`prisma/schema.prisma:537`) no tiene pantalla ni endpoint: las 33
  recetas se cargaron con scripts. Los insumos son 10 fundas, modelos **inactivos** de la categoría
  Insumos.

## 2. Modelo de datos

### Tablas nuevas o cambios
```sql
-- prisma/sql/combinaciones.sql — aditivo y compatible con el código que está en producción.

create table if not exists public.combinaciones (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   text not null default 'sendero3d',
  modelo_id   text not null references public.modelos(id) on update cascade on delete restrict,
  variantes   text[] not null default '{}',     -- ids de variantes_modelo, ordenados
  clave       text not null,                    -- "<modelo_id>|<variantes ordenadas>"
  sku         text,                             -- null si el modelo no tiene SKU (spec 001, RN-4)
  nombre      text not null,                    -- "Tanjiro Katana vieja 95cm · Con Funda"
  activo      boolean not null default true,
  creado_en   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, clave)
);
create unique index if not exists combinaciones_sku_unico
  on public.combinaciones (tenant_id, upper(sku)) where sku is not null;
create index if not exists combinaciones_modelo on public.combinaciones (tenant_id, modelo_id);

create table if not exists public.mapeos_canal (
  id              text primary key default gen_random_uuid()::text,
  tenant_id       text not null,
  canal           text not null check (canal in ('mercadolibre', 'shop')),
  clave           text not null,                -- spec 004, RN-1
  combinacion_id  text references public.combinaciones(id) on update cascade on delete restrict,
  unidades        integer not null default 1 check (unidades >= 1),
  ignorar         boolean not null default false,
  origen          text not null default 'auto' check (origen in ('siembra', 'auto', 'manual')),
  descripcion     text,                         -- título + opciones, para la cola
  muestra         jsonb,                        -- lo último que mandó el canal con esta clave
  veces_vista     integer not null default 0,
  ultima_venta    text,                         -- externoId del último pedido
  creado_en       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, canal, clave)
);

alter table public.items_pedido
  add column if not exists combinacion_id text references public.combinaciones(id),
  add column if not exists clave_canal    text;  -- para completar la línea al mapear su clave

alter table public.combinaciones enable row level security;
alter table public.mapeos_canal  enable row level security;
```
- RLS: activada sin políticas, como el resto de las tablas del ERP: sólo las lee Prisma con el
  usuario de la base. El rol `authenticated` (Bodega, el celular) no las necesita.
- Archivo versionado: `prisma/sql/combinaciones.sql`, más `Combinacion`, `MapeoCanal` y los dos
  campos de `ItemPedido` en `prisma/schema.prisma`.
- Compatibilidad: el código de hoy no lee ninguna de las columnas nuevas; se puede aplicar antes
  de desplegar.

## 3. Endpoints
| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| GET | `/api/combinaciones?modeloId=&q=` (nuevo) | `getAuthenticatedTenant` | Lista o busca combinaciones (nombre o SKU) para el diálogo y el mapeo |
| POST | `/api/combinaciones` (nuevo) | NonDemo | Crea `{ modeloId, variantes, sufijos? }`; si existe, devuelve la existente (spec 001, CA-5) |
| PATCH | `/api/combinaciones/[id]` (nuevo) | NonDemo | `activo`; `sku` sólo si estaba en null |
| POST | `/api/combinaciones/sembrar` (nuevo) | NonDemo | Siembra idempotente (spec 001, RN-3); devuelve creadas y "faltan datos" |
| GET | `/api/combinaciones/verificar` (nuevo) | NonDemo | Modo sombra: compara los componentes por JSON y por combinación en pedidos abiertos (spec 002) |
| POST | `/api/combinaciones/backfill` (nuevo) | NonDemo | Completa `combinacion_id` en líneas existentes (spec 003, RN-1); con `?simular=1` sólo informa |
| GET | `/api/integraciones/mapeos?canal=&estado=cola\|todos` (nuevo) | NonDemo | La cola y los mapeos |
| PATCH | `/api/integraciones/mapeos/[id]` (nuevo) | NonDemo | `{ combinacionId, unidades, ignorar }`; queda `manual`; completa las líneas abiertas con esa `clave_canal` y reparte (spec 004, REQ-5) |
| POST | `/api/integraciones/mapeos/sembrar-ml` (nuevo) | NonDemo | Lee `GET /items/{MLA}` de cada publicación mapeada y siembra una clave por variación |
| GET | `/api/combinaciones/[id]/receta` (nuevo) | `getAuthenticatedTenant` | La pieza y los insumos que consume la combinación (lo mismo que calcula `componentesDeItem`) |
| PUT | `/api/combinaciones/[id]/receta` (nuevo) | NonDemo | `{ insumos: [{ stockId, cantidad }] }`: reescribe las `reglas_insumo` con `requiere` = variantes de la combinación, y reparte |
| GET | `/api/insumos` (nuevo) | `getAuthenticatedTenant` | Filas de stock de los modelos de la categoría Insumos, activos o no |
| POST | `/api/modelos/[id]/accesorios` (nuevo) | NonDemo | `{ nombre: "Funda", stockId? }`: crea "Con/Sin <nombre>" si faltan, sus combinaciones, y la receta si viene el insumo |
| POST | `/api/pedidos`, PUT `/api/pedidos/[id]` (existentes) | sin cambios | Aceptan `combinacionId` por línea; si viene, `modeloId` sale de la combinación |
| POST | `/api/webhook/shop/pedido` (existente) | HMAC, sin cambios | Resuelve por `mapeos_canal`; acepta `producto_id`, `grupo_id`, `opcion_id` opcionales |
| POST | `/api/webhooks/mercadolibre` (existente) | sin cambios | `processMlOrderGroup` resuelve por `mapeos_canal` con `MLA\|variation_id` |

La siembra del Shop (spec 004, REQ-7) no es un endpoint: el ERP no tiene credenciales de la base
del Shop. Es un script de una vez (`scripts/sembrar-mapeos-shop.mjs`) que recibe el catálogo del
Shop exportado a JSON (productos activos con grupos y opciones) y crea las claves.

## 4. Páginas y componentes
| Ruta / componente | Server o client | Notas |
|---|---|---|
| `src/lib/combinaciones.ts` (nuevo) | — | Puro: `claveDe`, `nombreDe`, `sufijosDe` (RN-2 de la spec 001, colisiones incluidas), `skuDe`. Con base: `asegurarCombinacion(tx, tenantId, modeloId, variantes)` |
| `src/lib/mapeo-canal.ts` (nuevo) | — | Puro: `claveMl`, `claveShop` (ids o transitoria), `aplicarUnidades`. Con base: `resolverLinea(canal, clave, sugerencia)` → `{ combinacion, unidades }`, `{ ignorar }` o `{ cola }` |
| `src/lib/reservas.ts` | — | `ItemResoluble` suma `combinacion?: { modeloId, variantes }`; si está, las variantes salen de ahí (spec 002). Nueva `verificarReparto(tenantId)` |
| `/modelos/[id]` | Client | Sección "Combinaciones" con SKU, estado, alta, lo que consume cada una, "Agregar accesorio" y selector de insumo |
| `/integraciones` | Client | Pestaña "Mapeo": cola y listado por canal, con selector de combinación |
| `src/components/combinacion-select.tsx` (nuevo) | Client | Buscador por nombre o SKU, lo usan el diálogo y el mapeo |
| `pedido-dialog.tsx` | Client | Cada línea elige una combinación; las líneas a medida siguen como están |

## 5. Permisos
El inventario no tiene catálogo de permisos: sesión de Supabase (`getAuthenticatedTenant`), y
`getAuthenticatedTenantNonDemo` para todo lo que escribe combinaciones o mapeos, como el resto de
Integraciones.

## 6. Integraciones externas
- **Mercado Libre, sólo lectura:** `GET /items/{MLA}` (con `mlFetch`, `src/lib/mercadolibre.ts:210`)
  para listar las variaciones en la siembra. 99 publicaciones, de a una, con pausa. **No se
  escribe nada en ML** (regla: nunca modificar publicaciones).
- **Shop:** sólo el cambio de la spec 005, que hace su sesión. Hasta que llegue, la clave
  transitoria por SKU y nombres.
- **Bodega:** nada. Sus piezas siguen enlazadas a `stock.bodega_model_id`.

## 7. Seguridad
- Todas las consultas filtran por `tenant_id`; la siembra y el backfill corren por tenant.
- El webhook del Shop sigue con HMAC; los campos nuevos son opcionales y se validan con zod
  (uuid). Un id inventado sólo produce una clave sin mapear: cae en la cola, no resuelve a nada.
- Ningún endpoint nuevo escribe fuera del tenant de la sesión. La cuenta demo no escribe.

## 8. Pruebas
- **Lógica pura** (scripts con fixtures inventados, como los de la fase 0): sufijos y colisiones
  (los casos reales de la Bola de JOJOS y los integrantes de BTS), claves de ML y del Shop
  (transitoria y por ids), unidades, idempotencia de la siembra.
- **Modo sombra en producción:** `GET /api/combinaciones/verificar` sobre los pedidos abiertos
  reales, sólo lectura. El cambio del reparto no se despliega con diferencias.
- **Backfill:** primero con `?simular=1`; comparar los totales de finanzas y del panel antes y
  después (spec 003, CA-5).
- **Webhooks:** en un tenant aislado y borrado después, como la prueba del 2026-10-18 de
  cancelaciones y líneas a medida: venta mapeada, sin mapear, pack, katana por tamaño, y mapear
  la cola completa la línea abierta.

## 9. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| El reparto nuevo reserva distinto que el viejo | Modo sombra hasta cero diferencias; el reparto cae al JSON si la línea no tiene combinación |
| Un mapeo automático equivocado | Regla estricta (spec 004, RN-4); quedan marcados `auto` y se revisan en la pantalla; uno corregido queda `manual` |
| SKUs repetidos | Índice único por tenant; colisiones de sufijo resueltas al crear |
| El catálogo del Shop o las variaciones de ML cambian | La clave nueva cae en la cola; la venta entra igual, a revisar |
| Siembra de ML contra los límites de la API | De a una publicación, con pausa; se puede reanudar (idempotente) |
| Una receta mal cargada desde la pantalla | Muestra lo que va a consumir antes de guardar; reparte al guardar, así el efecto se ve en los pedidos abiertos enseguida |
| Backfill que mueve números | No cambia `modeloId`, precios ni costos: sólo agrega `combinacion_id` |

## 10. Documentación a actualizar
- [ ] `01 - Inventario/INV - Flujos.md`: cómo entra una venta (2.1 y 2.2) con el mapeo y la cola,
  la pestaña Mapeo de Integraciones y los endpoints nuevos.
- [ ] `Flujos del ecosistema.md`: contrato 1 (el payload del Shop suma ids) y contrato 2 (ML se
  resuelve por publicación + variación).
- [ ] `INV - Integración Mercado Libre`, `INV - Integración Sendero Shop`, `INV - Modelos`
  (combinaciones y recetas), `INV - Changelog`, `INV - Decisiones`.
- [ ] `Stock unificado`: las recetas ya se cargan desde el ERP; la disponibilidad en los canales
  pasa a la feature 002.
- [ ] `Mapeo de productos` (estado de cada fase) y `Convención de SKU` (el formato real es
  `SS-…` + sufijo; el `KAT-TANJI-95-CF` de agosto nunca se aplicó).
- [ ] Avisar a la sesión del Shop que la spec 005 es suya, y que `SHOP - Integración Inventario`
  va a quedar vieja en el contrato 1.
