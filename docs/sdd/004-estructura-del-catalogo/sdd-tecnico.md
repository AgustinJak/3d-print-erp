---
feature: 004-estructura-del-catalogo
estado: validated
actualizado: 2026-10-24
---

# SDD técnico · Estructura del catálogo

## 1. Estado actual
- **Datos**: `modelos` (producto), `variantes_modelo` (nombre, adicionales, `afecta_stock`, sin
  grupo), `stock` (una fila por modelo o por variante con `afecta_stock`, con `bodega_model_id`),
  `combinaciones` (modelo + variantes, SKU), `reglas_insumo` (modelo, `requiere` = variantes,
  `stock_id` del insumo, cantidad), `mapeos_canal`, `publicaciones_ml`.
- **Al 2026-10-24**: 98 modelos activos (59 simples, 5 con variantes de pieza, 33 con funda, 35
  partidos por tamaño), 30 inactivos, 30 consolidados; 125 filas de stock activas (122 con pieza);
  10 fundas como modelos inactivos, usadas por 16, 8, 2 y 1 katanas; 149 piezas en Bodega, 17 sin
  fila.
- **Lista** `src/app/(app)/modelos/page.tsx` (1.436 líneas): el diálogo (`:1010`) manda todo a
  `PUT /api/modelos/[id]`. Sus variantes no traen `costoInsumosAdicional` (`:372`, `:462`), y
  `parsePrice(undefined)` es 0 (`src/lib/utils.ts:20`): **cada guardado borra ese costo**.
- **PUT** `src/app/api/modelos/[id]/route.ts:59`: empareja variantes por nombre (renombrar =
  borrar y crear; `soltarVariantesBorradas` desactiva sus combinaciones).
- **Página** `src/app/(app)/modelos/[id]/page.tsx`: de sólo lectura; "Editar" vuelve a la lista
  (`:129`); margen sólo con `costoFab` (`:92`). Usa `<CombinacionesModelo>`
  (`src/components/combinaciones-modelo.tsx`): recetas y "Agregar accesorio".
- **Alta desde Bodega** `src/lib/altas-bodega.ts`: un modelo por pieza, salvo homónimos. Se llama
  desde `/api/cambios`, `GET /api/stock` y `/api/cron/ml`.
- **Costos**: `src/lib/costos-bodega.ts:136` (`costosPorFilaDeStock`, con el precio por kilo de
  `calc_precioKg`), `src/lib/sincronizar-costos.ts` (plan + `aplicarPlanDeCostos`, a mano desde
  `/api/costos/bodega`). Los costos del modelo se leen en 26 archivos (`costoModelo`,
  `costoVariante`, `costoFab`…).
- **Enganche con Bodega**: `public.bodega_mapear_modelo` (`prisma/sql/bodega-stock.sql:101`), hoy
  sólo desde Bodega (`src/main/stock-erp.ts:340` y `Configuracion.tsx:927`).

## 2. Modelo de datos
```sql
-- prisma/sql/catalogo-grupos-e-insumos.sql — aditivo; los pedidos viejos no cambian.
alter table public.variantes_modelo add column if not exists grupo text;
alter table public.variantes_modelo add column if not exists tipo text
  check (tipo in ('pieza', 'insumo', 'decoracion'));
alter table public.modelos add column if not exists es_insumo boolean not null default false;

-- Relleno (script con simulación, TASK-002):
--   tipo  = 'pieza' si afecta_stock; 'insumo' si es "Con X"/"Sin X" de un par; si no, 'decoracion'.
--   grupo = X para los pares; para las piezas y decoraciones, el que corresponda por producto
--           (Bola de JOJOS → Color, Jabonera → Diseño, BT21 → Personaje, NUBE → Color,
--            Sauce → Color, Vaso Bts → Firma); el resto, "Variante".
--   es_insumo = los modelos cuyo stock usa alguna receta, y los de la categoría Fundas.
-- Después:
alter table public.variantes_modelo alter column tipo set not null;
alter table public.variantes_modelo add constraint variantes_tipo_y_stock
  check ((tipo = 'pieza') = afecta_stock);
```
- `afecta_stock` se queda: lo leen el reparto y las filas de stock. La restricción impide que se
  contradiga con `tipo`.
- `costoFab`, `costoInsumos` y los adicionales se quedan como **caché** que escribe el ERP desde
  Bodega (spec 007); dejan de editarse a mano salvo en productos sin pieza. Así los 26 archivos que
  los leen no cambian.
- `prisma/schema.prisma`: los tres campos nuevos.

## 3. Endpoints
| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/api/modelos/[id]/ficha` | sesión | Todo lo de la página en una vuelta: producto, grupos y opciones con su fila, pieza y costo, combinaciones con receta, insumos usados, publicaciones de ML, claves de los canales. |
| PATCH | `/api/modelos/[id]` | sesión | Parcial: datos, precio, fotos, activo, costo (sólo sin pieza). Nunca toca variantes. SKU repetido → 409 con quién lo tiene. |
| POST | `/api/modelos/[id]/grupos` | sesión | `{ nombre, tipo, opciones[], insumoStockId? }`. Pieza/decoración: crea las variantes; insumo: el par Con/Sin y la receta (lo de `/accesorios`). Filas y combinaciones después. |
| PATCH | `/api/modelos/[id]/grupos` | sesión | `{ grupo, nombre?, tipo? }`: renombrar o cambiar de tipo (spec 003, RN-6). |
| POST | `/api/modelos/[id]/variantes` | sesión | `{ grupo, nombres[] }`: opciones nuevas en un grupo existente. |
| PATCH / DELETE | `/api/modelos/[id]/variantes/[vid]` | sesión | Por id: renombrar (actualiza el nombre de sus combinaciones), importes; borrar con `soltarVariantesBorradas`. |
| PUT | `/api/stock/[id]/bodega` | sesión, no demo | `{ bodegaModelId \| null }` → `bodega_mapear_modelo`; devuelve `liberado`. |
| GET | `/api/bodega/piezas` | sesión, no demo | Piezas con costo y a qué fila están enganchadas, más "Piezas nuevas" con su destino propuesto. |
| GET | `/api/insumos` | sesión | Existe; suma "usado por N" y qué productos. |
| PUT | `/api/insumos/[stockId]/reemplazar` | sesión | `{ porStockId }`: todas las recetas que lo usan pasan a otro. |

Se borran al final (commit aparte, TASK-014): `PUT /api/modelos/[id]`, `/api/modelos/[id]/accesorios`
(absorbido por `/grupos`), `/api/integraciones/skus-audit` y `/api/costos/bodega`.

## 4. Lógica
- **`src/lib/catalogo.ts`** (nuevo): `tipoDeGrupo`, `crearGrupo`, `agregarOpciones`,
  `renombrarVariante`, `cambiarTipoDeGrupo`, `borrarVariante`. Todas terminan en
  `asegurarFilasDeStock` + `sembrarCombinacionesDeModelo`, como hoy el PUT.
- **`altas-bodega.ts`**: `destinoDePieza(nombre, categoria)` → `{ producto }` | `{ producto,
  opcion }` | `{ insumo }` | `{ duda, motivo }` (spec 005). "Piezas nuevas" = las de `duda`.
- **Costo** (spec 007): `costosPorFilaDeStock` usa `bodega.models.material_id` →
  `bodega.materials.precio_kg` (con el por defecto si falta). `aplicarCostosSiCambio(tenantId)`:
  si ninguna pieza cambió desde la última corrida (`max(updated_at)` guardado en `config_tenant`),
  no hace nada; si cambió, `planDeCostos` + `aplicarPlanDeCostos` sólo para lo explicable. Se llama
  donde se llama `altasAutomaticas`.

## 5. Páginas y componentes
| Ruta / componente | Notas |
|---|---|
| `/modelos/[id]` | Reescrita: encabezado fijo (nombre, estado, SKU, precio, costo, margen, menú) y secciones. |
| `components/producto/seccion.tsx` | Tarjeta ver/editar con "Guardar", "Cancelar" y aviso de cambios sin guardar. |
| `components/producto/{datos,precio-costo,fotos}.tsx` | Un PATCH cada una; fotos guarda al subir (`FileUpload`). |
| `components/producto/variantes.tsx` | Grupos con su tipo; "Agregar grupo"; selector de pieza (`/api/bodega/piezas`) e insumo (`/api/insumos`). |
| `components/producto/lo-que-se-vende.tsx` | Sale de `combinaciones-modelo.tsx`. |
| `components/producto/donde-se-vende.tsx` | Sólo lectura. |
| `/modelos` | Sin diálogo de edición ni acciones de fila; "Nuevo producto" de un campo; filtros Insumos y Piezas nuevas; `?edit=<id>` → `/modelos/<id>`. |
| Menú e Integraciones | "Productos"; sin pestañas SKUs ni Costos. |
| Bodega (spec 008) | Textos "Pieza"; sin `StockErpSection` en Configuración; la convención en el alta. |

## 6. Permisos
Sesión de Supabase (`getAuthenticatedTenant`). Piezas de Bodega: `getAuthenticatedTenantNonDemo`
y el candado `esDeBodega` de `altas-bodega.ts`.

## 7. Seguridad
- Todo filtra por `tenantId` (producto, variante, fila de stock, receta).
- `bodega_mapear_modelo` es `security definer`: el endpoint verifica antes que la fila es del
  tenant.

## 8. Pruebas
- `scripts/sdd-004-probar-catalogo.ts` en un tenant aislado (como `sdd-001-probar-recetas.ts`):
  grupos de los tres tipos, alta en lote, renombrar con una clave mapeada, cambio de tipo con stock,
  insumo compartido y reemplazo en bloque, PATCH de precio sin perder insumos, SKU repetido.
- Alta desde Bodega con piezas inventadas en una transacción deshecha: "X · A", "X · B", Insumos,
  simple, conflicto.
- Costo: una pieza en PETG contra la calculadora de Bodega (tolerancia $1).
- Bodega: el proceso principal con esbuild y el Node de Electron sobre una copia de la base, como en
  la 2.34; las pantallas con el renderer en Vite y un `window.api` falso.
- La página del ERP con sesión la mira Agustín; antes, capturas con la API simulada.

## 9. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|
| El relleno de grupo y tipo clasifica mal una variante vieja | Simulación con la lista completa antes; Agustín la revisa; la restricción `check` frena contradicciones. |
| La convención engancha una pieza al producto equivocado | Sólo por nombre exacto del producto; en la duda, Piezas nuevas. |
| El costo automático pisa un costo cargado a mano a propósito | Sólo productos con pieza; los demás quedan a mano. El plan sigue saltando lo inexplicable. |
| Sacar el lápiz deja un campo sin dónde editarse | Checklist con los campos del diálogo (`page.tsx:1017` a `:1367`). |
| Bodega vieja en otra PC | Sigue funcionando: su mapeador llama a la misma función. |
