---
feature: 015-ajustes-y-precios
estado: validated
actualizado: 2026-11-18
---

# SDD técnico · Ajustes de precio por producto y Precios rediseñada

## 1. Estado actual

- **Política por producto:** `modelos.margen`, `promo_ml`, `redondeo`, `precio_ml_fijo`
  (`prisma/schema.prisma`, modelo `Modelo`), aplicada en `aplicarPolitica` y `gastosDe`
  (`src/lib/precios-combinacion.ts:231`).
- **Los tres precios:** `tresPreciosErp` (`src/lib/precios-ml-publicacion.ts:292`): ML con
  `opcionUnoConMargen`/`opcionUnoFija`, web con `precioWeb`, venta directa con `precioConMargen`.
- **Envío en ML:** por publicación, `l.costoEnvio ?? g.mlEnvioCosto`
  (`precios-ml-publicacion.ts:235`), y en la opción 2 `costosDeOpcionDos`.
- **Envío en la web:** `webEnvioCosto` y `webEnvioReservaPct` generales (`GastosVenta`).
- **Pantalla:** `src/app/(app)/precios/page.tsx` (965 líneas, seis pestañas con tablas) y
  `src/components/precios/*`. La política se edita en `components/producto/politica-precio.tsx`.

## 2. Modelo de datos

```sql
-- prisma/sql/ajustes-precio.sql (aditivo)
CREATE TABLE IF NOT EXISTS public.ajustes_precio (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL DEFAULT 'sendero3d',
  modelo_id   text NOT NULL REFERENCES public.modelos(id) ON DELETE CASCADE,
  canal       text NOT NULL CHECK (canal IN ('ml','web','personalizado')),
  tipo        text NOT NULL CHECK (tipo IN ('porcentaje','envio')),
  -- porcentaje: +3 = 3 % más; envio: pesos por unidad.
  valor       numeric NOT NULL,
  hasta       timestamptz,          -- null = sin fecha de fin
  nota        text,
  usuario     text,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, modelo_id, canal, tipo)   -- RN-3
);
CREATE INDEX IF NOT EXISTS ajustes_precio_modelo ON public.ajustes_precio (tenant_id, modelo_id);
ALTER TABLE public.ajustes_precio ENABLE ROW LEVEL SECURITY;  -- sin políticas: sólo el servidor
```

`envio` con canal `personalizado` no se admite (la venta directa no lleva envío): lo valida la API.

## 3. Cálculo

- `cargarContextoDePrecios` suma `ajustes: Map<modeloId, Ajuste[]>` con los **vigentes** (`hasta`
  null o futuro). Lo vencido no entra (RN-2).
- **Envío propio:** antes de calcular, `gastosDe` reemplaza `mlEnvioCosto`/`webEnvioCosto` por el
  del producto; en ML además el `costoEnvio` de la lectura de la publicación.
- **% por canal:** función pura `conAjuste(precio, pct)` = `precio × (1 + pct/100)`, aplicada al
  precio crudo de cada canal **antes** de redondear, dentro de `tresPreciosErp` (recibe
  `ajustes: { ml?, web?, personalizado? }`). En ML, el publicado se infla por la promo después.
  Con precio fijo de ML, el % de ML no se aplica (RN-4).
- Packs: el tramo por cantidad sale del precio de la unidad ya ajustado.
- El ajuste no toca la ganancia que se copia entre canales: se aplica después de igualar.

## 4. Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/precios/ajustes?modelo=` | Los ajustes de un producto (vigentes y vencidos) |
| PUT | `/api/precios/ajustes` | `{ modeloIds[], canal, tipo, valor, hasta?, nota? }`: crea o cambia el mismo ajuste en uno o varios productos |
| DELETE | `/api/precios/ajustes` | `{ modeloIds[], canal, tipo }` |
| POST | `/api/precios/ajustes/vista-previa` | Lo mismo que el PUT sin guardar: precio de hoy y nuevo de cada producto (RN-5) |

`/api/precios` (propuesta) suma en cada fila los ajustes vigentes, para las etiquetas.

## 5. Pantalla

| Componente | Notas |
|---|---|
| `app/(app)/precios/page.tsx` | Se reescribe: cabecera con lectura de ML y web, Historial y Configuración; fila de cuatro números; lista por producto; barra de selección. |
| `components/precios/ficha-precio.tsx` | La ficha al costado (`Sheet`): tira de tres canales con desglose, combinaciones con aplicar, ajustes. |
| `components/precios/ajustes.tsx` | Editor de ajustes (uno o varios productos), con fecha y nota, y la vista previa. |
| `components/precios/etiqueta-ajuste.tsx` | La firma: "+3 % web · hasta 30/11", igual en lista y ficha. |
| Las tablas de hoy | `TablaCanal`, `TablaErp`, `TablaHistorial` se reutilizan dentro de la ficha y del historial donde sirvan; `TablaCombinaciones` se reemplaza por la lista. |

Unslop: neutros del ERP, el naranja sólo en la acción principal y en la selección; números en
mono con `tabular-nums`; estados como texto quieto con un punto de color, no frases rojas largas.

## 6. Pruebas

- `scripts/sdd-015-probar-ajustes.ts`: `conAjuste`, el orden (ajuste antes de redondear, promo
  después), precio fijo ignora el % de ML, envío propio en ML y web, vencidos ignorados, pack.
- Contra la base: un ajuste de prueba en un producto real, la propuesta cambia, se borra.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un ajuste olvidado deja un precio raro meses | La etiqueta con fecha en la lista y la ficha; filtro "con ajustes". |
| El rediseño rompe el flujo de aplicar | La lógica de aplicar (confirmación, cambios grandes, historial, Flex) no se toca: se mueve. |
| Página lenta con todo cargado | Misma API de propuesta; la ficha pide el detalle de un producto. |

## 8. Documentación

- [ ] `INV - Flujos.md`: la sección de Precios y los endpoints nuevos.
- [ ] Ninguna nota de otro sistema: el Shop recibe precios como hoy.
