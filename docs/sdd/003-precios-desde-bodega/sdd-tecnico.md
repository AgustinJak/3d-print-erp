---
feature: 003-precios-desde-bodega
estado: validated
actualizado: 2026-10-24
---

# SDD técnico · Precios desde Bodega

Toca tres repos: Bodega (Electron + SQLite, sincroniza por PostgREST contra la base del ERP), el
ERP (Next.js + Prisma; SQL a mano en `prisma/sql/`) y el Shop (sólo la spec 006, la hace su
sesión). La base del ERP es una sola, la de producción: todo cambio es aditivo.

## 1. Estado actual
**Bodega**
- La fórmula de precios está en `src/renderer/src/lib/precios.ts` (846 líneas, pura: sólo importa
  `calc.ts` y tipos). `preciosPorCanal(gastos, fabricacion, insumos, redondeo)` (`:779`) da ML,
  web y personalizados; la ganancia sale de la fabricación y los insumos se suman al costo.
  `precioConPromo` (`:235`) infla el precio publicado de ML.
- La calculadora (`src/renderer/src/pages/Calculadora.tsx`) guarda los gastos de venta como
  settings locales `precio_<campo>` (`:127`); el margen es `gastos.margenMinorista` (`:180`), el
  redondeo es estado de la pantalla y no se guarda (`:56`), la promo tampoco (`:586`).
  "Guardar costeo" guarda `costData`, gramos y tiempo (`:133`).
- La ficha del modelo recalcula con el `calc_precioKg` global (`ModeloDetalle.tsx:34-58`) y muestra
  el precio viejo de ML, costo × 1,8 (`:344`).
- SQLite: tabla `models` (`src/main/db.ts:59`), columnas nuevas con `ALTER TABLE` condicionales
  en `migrate()` (`:114`).
- Sincronización (`src/main/sync.ts`): `subirParametrosDeCosto` (`:169`) sube a
  `bodega_cost_settings` sólo si cambió la huella; los modelos van a `bodega_models` (`:246-272`).

**Base del ERP, esquema `bodega`**
- Tablas `bodega.models`, `bodega.cost_settings`, `bodega.queue`, `bodega.allowed_users`. Bodega
  escribe por las vistas `public.bodega_models` (id, name, category, category_color, stock,
  updated_at, filament_grams, print_time_seconds, insumos), `public.bodega_cost_settings` y
  `public.bodega_queue`.

**ERP**
- `src/lib/costos-bodega.ts`: `fabricacionDeReceta` (`:68`, copia de `calc.ts` de Bodega),
  `leerParametros` (`:76`, `bodega.cost_settings`), `leerRecetas` (`:107`, `bodega.models`),
  `costosPorFilaDeStock` (`:136`). El puente es `stock.bodega_model_id`.
- Combinaciones, recetas y mapeo por canal del SDD 001: `src/lib/combinaciones.ts`,
  `src/lib/recetas.ts` (`recetaDeCombinacion`), `src/lib/mapeo-canal.ts`, tabla `mapeos_canal`.
- Precio de venta: `Modelo.precioVenta` (`prisma/schema.prisma:87`) y
  `VarianteModelo.precioAdicional`, que suma el diálogo de pedido.
- ML: `mlFetch` (`src/lib/mercadolibre.ts:210`); hoy sólo `GET`.

**Shop** (sólo lectura, para la spec 006)
- `productos.precio`, `productos.precio_oferta`, `variante_opciones.precio_adicional`,
  `variante_precio_reglas (opcion_id, cuando_opcion_id, precio_adicional)`: la regla reemplaza el
  extra de la opción cuando se eligió la otra (SS-00136: 23.000 + 10.000 + 20.000 = 53.000).

## 2. Modelo de datos

### Base del ERP

Dos archivos: `prisma/sql/bodega-materiales-y-precios.sql` (lo de Bodega, aplicado el
2026-10-20) y `prisma/sql/precios-por-canal.sql` (lo del ERP, aplicado el 2026-10-24). Abajo, todo
junto. Al implementar, los precios del ERP pasaron a `double precision` (como `precio_venta`, para
que Prisma los lea como `Float`) y se sumó `mapeos_canal.precio_lectura`.
```sql
-- Bodega: materiales y política de precio por modelo (specs 001 y 002).
create table if not exists bodega.materials (
  id          text primary key,              -- uuid generado en Bodega
  nombre      text not null,                 -- "GST3D PLA"
  precio_kg   numeric not null check (precio_kg > 0),
  por_defecto boolean not null default false,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now()
);
create unique index if not exists materials_un_defecto on bodega.materials ((true)) where por_defecto;

alter table bodega.models
  add column if not exists material_id text,   -- null = el por defecto
  add column if not exists margen      numeric, -- % ; null = el global
  add column if not exists redondeo    text,    -- exacto|cien|quinientos|mil|noventa; null = global
  add column if not exists promo_ml    numeric, -- % ; null = el global
  add column if not exists precios     jsonb;   -- foto: {ml, web, personalizado, ganancia, guardado_en}

alter table bodega.cost_settings
  add column if not exists gastos_venta jsonb;  -- GastosVenta + redondeo y promo globales

-- Las vistas por las que escribe Bodega suman las columnas al final (create or replace
-- lo permite) y se crea la de materiales, con los mismos permisos que bodega_models.
create or replace view public.bodega_models as
  select id, name, category, category_color, stock, updated_at, filament_grams,
         print_time_seconds, insumos, material_id, margen, redondeo, promo_ml, precios
  from bodega.models;
create or replace view public.bodega_cost_settings as
  select id, precio_kg, precio_kwh, consumo_w, desgaste_horas, precio_repuestos, margen_error,
         updated_at, gastos_venta
  from bodega.cost_settings;
create or replace view public.bodega_materials as
  select id, nombre, precio_kg, por_defecto, activo, updated_at from bodega.materials;

-- ERP: historial y precio publicado leído por clave (spec 004).
alter table public.mapeos_canal
  add column if not exists precio_publicado double precision,
  add column if not exists precio_leido_en  timestamptz,
  add column if not exists precio_lectura   jsonb;   -- estado, promoción, automatización, variaciones

create table if not exists public.cambios_precio (
  id             text primary key default gen_random_uuid()::text,
  tenant_id      text not null,
  canal          text not null check (canal in ('mercadolibre', 'shop', 'erp')),
  clave          text not null,          -- la de mapeos_canal, o el id del modelo para 'erp'
  combinacion_id text references public.combinaciones(id),
  antes          numeric,
  despues        numeric not null,
  estado         text not null check (estado in ('aplicado', 'rechazado', 'error')),
  respuesta      jsonb,                  -- lo que contestó el canal
  usuario        text,
  creado_en      timestamptz not null default now()
);
alter table public.cambios_precio enable row level security;
```
- Permisos de `public.bodega_materials`: los mismos `grant` y políticas que `public.bodega_models`
  (se copian al escribir el SQL, leyendo los de hoy).
- `cambios_precio`: RLS sin políticas, como el resto del ERP.

### Bodega (SQLite, `src/main/db.ts`, `migrate()`)
- Tabla `materials (id, nombre, precioKg, porDefecto, activo, updatedAt)`. Al crearla, un material
  "Filamento" con el `calc_precioKg` de hoy y `porDefecto = 1` (spec 001, RN-2).
- `models`: `materialId`, `margen`, `redondeo`, `promoMl`, `precios` (texto JSON).
- Settings nuevos: `precio_redondeo`, `precio_promoMl` (globales).

## 3. Endpoints (ERP)
| Método | Ruta | Sesión | Qué hace |
|---|---|---|---|
| GET | `/api/precios?filtro=diferencias\|falta-costear\|falta-mapear&canal=` | NonDemo | La propuesta: por combinación costo, tres precios, foto de Bodega; por clave de canal, publicado y propuesto |
| POST | `/api/precios/leer?canal=mercadolibre\|shop` | NonDemo | Lee los precios publicados (ML: `GET /items?ids=` de a 20; Shop: spec 006 con `simular`) y los guarda en `mapeos_canal` |
| POST | `/api/precios/aplicar` | NonDemo | `{ canal, filas: [{ clave, precio }], confirmado: true }`: verifica que la lectura no tenga más de una hora, aplica de a una, escribe `cambios_precio` |
| GET | `/api/precios/historial?clave=&canal=` | NonDemo | El historial |

## 4. Módulos y pantallas
| Archivo | Qué |
|---|---|
| `src/lib/precios-bodega.ts` (ERP, nuevo) | **Copia** de `precios.ts` (sin `preciosDeImpresion`, que es lo único que usaba `calc.ts`) y de la política y `tresPrecios` de `politica.ts`, con un encabezado que dice de qué versión. Sin cambios de lógica. La arma `scripts/sdd-003-copiar-formula.ts` |
| `scripts/sdd-003-comparar-formula.ts` (ERP, nuevo) | Importa la fórmula de Bodega por ruta relativa y la del ERP, las corre sobre una grilla de entradas y falla si difieren. Se corre en cada release de Bodega |
| `src/lib/precios-combinacion.ts` (ERP, nuevo) | `costoDeCombinacion` (pieza + insumos, spec 003 RN-1), `preciosDeCombinacion`, `precioDeClave` (unidades y tramos, RN-3), `precioDeVentaErp` (RN-4) |
| `src/lib/precios-ml.ts` (ERP, nuevo) | Leer precios, chequear si se puede tocar (estado, automatización, promoción), escribir el precio |
| `src/lib/precios-shop.ts` (ERP, nuevo) | Cliente firmado del endpoint de la spec 006 |
| `src/lib/precios-propuesta.ts` (ERP, nuevo) | Arma lo que muestra la pantalla (filas por clave de canal y por producto para el ERP) y aplica: vuelve a armar la propuesta en el servidor y rechaza la fila si el precio aprobado ya no es el que da la cuenta |
| `src/lib/precios-reglas.ts` (ERP, nuevo) | Las reglas que usan igual el servidor y la página (30 %, "con diferencia", el texto de "falta costear"), sin Prisma |
| `src/lib/costos-bodega.ts` (ERP) | `leerRecetas` suma `material_id`; `leerParametros` suma los materiales; `fabricacionDeReceta` recibe el precio del material |
| `/precios` (ERP, nueva, client) | La pantalla de la spec 004, en el grupo Catálogo del sidebar |
| Bodega `Configuracion` (sección Materiales y precio por kilo), `Calculadora`, `ModeloDetalle`, `lib/politica.ts` | Specs 001 y 002 |
| Bodega `src/main/sync.ts` | Sube `bodega_materials`, los campos nuevos de `bodega_models` y `gastos_venta` |
| Bodega IPC nuevos | `materials:list`, `materials:save`, `materials:setDefault`, `materials:deactivate`, `models:savePricing` |

## 5. Permisos
`getAuthenticatedTenantNonDemo` en todos los endpoints nuevos. En Bodega, los mismos que hoy.

## 6. Integraciones externas
- **Mercado Libre (escritura nueva, sólo precio).** Lo verificado el 2026-10-24 está en el
  encabezado de `src/lib/precios-ml.ts` y en la bitácora.
  - Leer: `GET /items?ids=<hasta 20>` para estado, variaciones y catálogo; el precio, de
    `GET /items/{id}/prices` (el standard), porque ML va a sacar `price` de `/items` y en 3 de 100
    publicaciones ya devuelve ahí el de la promoción; lo que paga el cliente, de
    `GET /items/{id}/sale_price?context=channel_marketplace`; la automatización, de
    `GET /pricing-automation/users/{id}/items`.
  - Chequeos antes de escribir: automatización de precios y promoción activa. Los recursos exactos
    para MLA se confirman en TASK-012 (la documentación pública que se encontró es la de Global
    Selling).
  - Escribir: `PUT /items/{MLA}` con `{ price }`. Verificado: el rechazo del 2026-03-18 es **sólo**
    para publicaciones con automatización de precios (400 `item.price.not_modifiable`), y el
    recurso nuevo (`POST /items/{id}/prices/standard`) todavía no está disponible. Las
    publicaciones con variaciones no se escriben: mandar `variations` borra las que no van, y hoy
    ninguna mapeada tiene.
  - ML recalcula solo el envío gratis obligatorio según el precio y renueva el vencimiento con
    cualquier `PUT`: se informa aparte y no cuenta como "otro campo tocado".
  - En campaña, el cliente sigue pagando la oferta hasta que termina (spec 005, RN-6). El fin se lee
    de la promoción ganadora en `/prices` (`conditions.end_time`) y queda en `precio_lectura`.
- **Shop:** el endpoint de la spec 006. Variables nuevas en el ERP: `SHOP_API_URL` (base del Shop).
  La firma usa `SHOP_WEBHOOK_SECRET`, el mismo secreto del contrato 1.
- **Bodega:** nada en vivo; todo pasa por las tablas `bodega.*`.

## 7. Seguridad
- Nada se escribe en un canal sin un `POST /api/precios/aplicar` con `confirmado: true` desde la
  pantalla; no hay cron ni disparo desde Bodega.
- En ML viaja sólo el precio (CA-4 de la spec 005 lo compara con un `GET` antes y después).
- El endpoint del Shop exige firma y timestamp en ventana, como el webhook de hoy.

## 8. Pruebas
- **Paridad de la fórmula** (`sdd-003-comparar-formula.ts`): la de Bodega contra la copia, en una
  grilla de fabricación, insumos, márgenes, redondeos y promos, incluido el cruce del umbral de
  envío. Tiene que dar idéntico.
- **Combinaciones** (spec 003): CA-1 a CA-4 en un tenant aislado, con modelos de Bodega de prueba
  en `bodega.models` marcados como de prueba y borrados al final.
- **Pantalla y aplicar ERP**: tenant aislado.
- **ML**: simulación (sólo `GET`) sobre todas las publicaciones mapeadas; después **una** escritura
  real aprobada por Agustín y la comparación de campos antes y después.
- **Shop**: `simular: true` contra producción; escritura cuando el Shop la tenga, con un producto
  elegido por Agustín.
- **Bodega**: la migración del día cero no cambia ningún costo (spec 001, CA-3), comparando
  `costosPorFilaDeStock` antes y después.

## 9. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| La copia de la fórmula se desfasa de Bodega | Script de paridad, en cada release de Bodega; la copia dice de qué versión es |
| ML cambió cómo se escribe el precio (marzo de 2026) | TASK-012 lo verifica antes; una sola publicación de prueba |
| Un costo mal cargado publica un precio malo | Aprobación obligatoria; marca roja a más de 30 %; historial para volver atrás |
| Cambiar el precio de una publicación en promoción la saca de la promo | No se toca hasta verificarlo (spec 005, RN-3) |
| El Shop no puede representar una combinación (tres grupos) | `no_representable`, no escribe ese producto |
| Migración de materiales que mueve costos | Material por defecto con el precio de hoy; CA-3 de la spec 001 |
| Bodega de otra PC con versión vieja pisa las columnas nuevas | Las columnas nuevas son nullables y la versión vieja no las manda: PostgREST no las toca |

## 10. Documentación a actualizar
- [ ] `01 - Inventario/INV - Flujos.md`: la pantalla Precios, los endpoints y el flujo 3.1.
- [ ] `03 - Bodega/BOD - Flujos.md`: IPC nuevos, Materiales, la calculadora y la sincronización.
- [ ] `Flujos del ecosistema.md`: contrato nuevo ERP → Shop (precios), ERP → ML (escritura de
  precio) y lo que suma el contrato 3 (Bodega → ERP).
- [ ] `INV - Decisiones`: ML deja de ser sólo lectura para el precio.
- [ ] `Bodega/Bodega3D-App/docs/sdd/README.md`: el pendiente de materiales se mueve acá.
- [ ] Avisar a la sesión del Shop que la spec 006 es suya.
