---
feature: 014-modelos-en-el-erp
estado: validated
actualizado: 2026-11-16
---

# SDD técnico · Los modelos viven en el ERP

## 1. Estado actual

- **Piezas.** La Bodega guarda cada pieza en su SQLite (`Bodega/Bodega3D-App/src/main/db.ts:60`,
  tabla `models` con `filePath`, `fileName`, `fileSize`, `fileType`, `thumbnailPath`) y el archivo en
  `%APPDATA%\bodega-3d\storage\models\<id>\` (`db.ts:21`, `storage.ts:68`). La sincronización sube la
  pieza a `bodega.models` (vista `public.bodega_models`) con nombre, categoría, gramos, tiempo, insumos
  y material (`sync.ts:287-305`), y nunca crea localmente una pieza que baja (`sync.ts:373`).
- **Alta en el ERP.** `src/lib/altas-bodega.ts` crea el producto, la fila de stock y el enganche
  (`stock.bodega_model_id`) para cada pieza nueva; la primera corrida marcó lo viejo como "no traer".
  "Traer de Bodega" llama a `POST /api/bodega/altas` con `accion: "traer"`.
- **"Nuevo producto".** `src/app/(app)/modelos/page.tsx:218` hace `POST /api/modelos` con nombre y
  serie, sin pieza.
- **Biblioteca (SDD 012).** `public.archivos_3d` (`prisma/sql/tareas-y-archivos.sql:48`), bucket
  privado `archivos-3d` (500 MB por archivo, vacío), subida con token firmado desde el navegador
  (`src/components/archivos/subir.ts:22`), links firmados de 10 minutos (`src/lib/tareas.ts:299`),
  visor three.js.
- **Bucket público `modelos-3d`.** 44 archivos; `modelos.archivo_3mf_url` lo usa en 32 productos
  (`src/components/producto/fotos.tsx:99`).
- **Lectura del 3MF.** Sólo en la Bodega, con `adm-zip` (`storage.ts:17`): suma `prediction` y
  `weight` de `Metadata/slice_info.config` y toma la primera miniatura de una lista.

## 2. Modelo de datos

```sql
-- prisma/sql/archivos-de-piezas.sql (aditivo)
-- Para que la Bodega sepa si cambió sin bajarlo (RN-2 de la spec 003) y no subir dos veces lo mismo.
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS hash text;  -- sha256 del archivo
-- Las placas leídas del 3MF: [{ "n": 1, "nombre": "", "miniatura": "piezas/<id>/placa-1.png",
--   "gramos": null, "segundos": null }]. null en un STL.
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS placas jsonb;

-- Qué archivo (y qué placa) es cada pieza. Un archivo puede ser de varias piezas (colores, placas);
-- una pieza, de a lo sumo un archivo (RN-2 de la spec 001).
CREATE TABLE IF NOT EXISTS public.piezas_archivo (
  bodega_model_id text PRIMARY KEY,
  tenant_id       text NOT NULL DEFAULT 'sendero3d',
  archivo_id      text NOT NULL REFERENCES public.archivos_3d(id) ON DELETE CASCADE,
  placa           integer,          -- null = el archivo entero
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS piezas_archivo_archivo ON public.piezas_archivo (archivo_id);
ALTER TABLE public.piezas_archivo ENABLE ROW LEVEL SECURITY;  -- sin políticas: sólo el servidor
```

- Sin FK a `bodega.models`, igual que `stock.bodega_model_id`: la pieza puede llegar después.
- Borrar un archivo de la biblioteca suelta sus piezas (`ON DELETE CASCADE` sobre el enganche, no
  sobre la pieza); la página avisa cuántas piezas quedan sin archivo antes de borrar.
- **Lectura desde la Bodega** (etapa 3): una función `public.bodega_archivos_de_piezas()`
  `SECURITY DEFINER`, sólo `authenticated`, que devuelve `bodega_model_id, archivo_id, placa,
  nombre, tamano, hash, actualizado_en, ruta, miniatura_ruta` del tenant `sendero3d`. Y una política de `storage.objects`
  para `SELECT` de `authenticated` en `bucket_id = 'archivos-3d' AND name LIKE 'piezas/%'`, para que
  la Bodega pida su link firmado con su propia sesión. La biblioteca suelta (`archivos/...`) sigue
  sólo para el servidor.
- **Pieza nueva desde el ERP** (etapa 2): `INSERT` en `bodega.models` con un UUID del servidor. Hoy
  la tabla la escribe la Bodega; se agrega una columna `origen text DEFAULT 'bodega'` para que la
  Bodega distinga lo que no creó.

## 3. Endpoints

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/api/piezas/[id]/archivo` | sesión, sin demo | El archivo de la pieza, su placa y un link firmado para verlo o bajarlo |
| PUT | `/api/piezas/[id]/archivo` | sesión, sin demo | Engancha la pieza a un archivo de la biblioteca y una placa, o la suelta |
| POST | `/api/archivos` (existe) | sesión, sin demo | Prepara la subida; se le suma `carpeta: "piezas"` para la ruta `piezas/<id>/` |
| PATCH | `/api/archivos/[id]` (existe) | sesión, sin demo | Confirma la subida; se le suman `hash` y `placas` (con sus miniaturas ya subidas) |
| POST | `/api/archivos/[id]/reemplazar` | sesión, sin demo | Prepara el reemplazo: dice cuántas piezas lo usan y da el token para la versión nueva |
| POST | `/api/productos/alta` | sesión, sin demo | Crea producto, grupos, piezas, filas de stock, combinaciones, recetas de insumo e insumos nuevos en una transacción; devuelve los ids de pieza para enganchar los archivos |

El alta no recibe archivos: el navegador los sube primero a la biblioteca (o después, si falla) y
el alta manda sólo `archivoId` y `placa` por pieza. Los gramos y el tiempo leídos del 3MF viajan
como datos de la receta y se aplican sólo si el usuario confirma (RN-5 de la spec 001).

## 4. Páginas y componentes

| Ruta / componente | Tipo | Notas |
|---|---|---|
| `src/lib/leer-3mf.ts` | pura | Port de `storage.ts:17` con `unzipSync` de `three/examples/jsm/libs/fflate.module.js` y `filter` para descomprimir sólo `Metadata/*.config` y las miniaturas. Devuelve las placas (`model_settings.config`: `plater_id`, `plater_name`; `plate_<n>.png`) y, si está laminado, gramos y tiempo por placa (`slice_info.config`, un `<plate>` con `index`, `prediction`, `weight`). Con pruebas sobre 3MF reales chicos, uno de varias placas. |
| `src/components/producto/archivo-de-pieza.tsx` | client | Miniatura (la de su placa), visor 3D (el de `components/archivos/visor-3d.tsx`), bajar, subir, reemplazar o elegir de la biblioteca, y elegir la placa. Va en la página del producto, por pieza. |
| `src/components/producto/elegir-placas.tsx` | client | Grilla de miniaturas de las placas de un 3MF: se tildan las que son opciones y se les pone nombre. |
| `src/components/producto/alta.tsx` | client | Reemplaza el diálogo de `modelos/page.tsx:531`: archivo, nombre, serie, material, gramos y tiempo, grupo "otra pieza" con sus opciones y sus modelos, grupo "insumo" con el selector de insumos (y "crear insumo"), y el resultado de `cotizar()`. |
| `src/app/(app)/cotizador/page.tsx` | client | Botón "Crear producto con esto", que abre el alta con los datos. |
| `src/app/(app)/modelos/page.tsx` | client | Saca "Traer de Bodega" en la etapa 3. |

## 5. Permisos

Sesión de Supabase con `getAuthenticatedTenantNonDemo()` en todo: la cuenta demo no ve ni sube
archivos de Bodega (Bodega es de un solo negocio, `altas-bodega.ts:41`).

## 6. Integraciones externas

- **Supabase Storage.** Subida firmada desde el navegador y desde el script (service role). El
  bucket admite 500 MB, pero manda el límite global del proyecto: se prueba con el archivo de
  229 MB antes de migrar.
- **Bambu Studio.** La Bodega abre el archivo con `shell.openPath` (`ipc.ts:359`), que usa el
  programa asociado a `.3mf` en Windows.

## 7. Seguridad

- Bucket privado, links de 10 minutos. Nada de URLs públicas para modelos.
- La política de `storage.objects` abre sólo `piezas/%` a `authenticated`. Hoy los únicos usuarios
  autenticados son del negocio; si algún día hay usuarios de otros tenants, la política tiene que
  mirar el tenant del usuario.
- El script de migración corre en la PC del taller con la service role de `.env` (no se copia a
  ningún lado) y sólo lee la carpeta de la Bodega.

## 8. Pruebas

- `scripts/sdd-014-probar-3mf.ts`: lectura de gramos, tiempo y miniatura con 3MF reales (uno
  laminado de varias placas, uno sin laminar, un STL).
- `scripts/sdd-014-migrar-archivos.ts --prueba`: lista sin escribir (CA-1 de la spec 001). Sin
  `--prueba`, sube; correrlo dos veces no sube nada (CA-6).
- En producción: subir y reemplazar el archivo de una pieza de prueba, crear un producto de prueba
  con archivo y borrarlo después, como en el SDD 012.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La Bodega pisa con sus datos viejos lo que se cambió en el ERP (gramos, nombre) | Etapa 3: la Bodega deja de subir los campos de la receta (REQ-7 de la spec 003). Entre la etapa 2 y la 3, el ERP no edita la receta de piezas con `origen = 'bodega'`. |
| El alta automática duplica una pieza creada en el ERP | El alta crea pieza y fila de stock enganchada en la misma transacción (RN-2 de la spec 002). |
| Una subida grande se corta | La fila queda `subido = false`; el script y la pantalla la retoman. |
| La caché de la Bodega descarga 800 MB de golpe | Descarga a pedido; en la PC del taller los archivos ya están en la carpeta (RN-3 de la spec 003). |
| Las 13 carpetas sin pieza son pruebas viejas | Quedan afuera (Agustín, 2026-11-16); siguen en la PC. |
| Se toman placas como variantes en un producto partido en placas (katanas) | Las placas nunca se vuelven opciones solas: el usuario las tilda (RN-8 de la spec 002). |
| Reemplazar un archivo compartido cambia varias piezas sin querer | El reemplazo dice antes cuántas piezas lo usan y pide confirmar. |

## 10. Documentación a actualizar

- [ ] `01 - Inventario/INV - Flujos.md`: alta de producto, archivo de pieza, endpoints nuevos.
- [ ] `03 - Bodega/BOD - Flujos.md`: canales IPC nuevos (descargar, abrir en Bambu Studio, caché) y
  "Dónde viven los datos".
- [ ] `Flujos del ecosistema.md`: el contrato de piezas se da vuelta (el ERP crea, la Bodega lee).
- [ ] `INV - Changelog`, `BOD - Changelog`, `INV - Decisiones`.
