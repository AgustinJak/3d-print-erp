---
feature: 014-modelos-en-el-erp
estado: draft
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
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS bodega_model_id text;
-- Una pieza, un archivo vigente (RN-2 de la spec 001).
CREATE UNIQUE INDEX IF NOT EXISTS archivos_3d_pieza
  ON public.archivos_3d (bodega_model_id) WHERE bodega_model_id IS NOT NULL;
-- Para que la Bodega sepa si cambió sin bajarlo (RN-2 de la spec 003).
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.archivos_3d ADD COLUMN IF NOT EXISTS hash text;  -- sha256 del archivo
```

- Sin FK a `bodega.models`, igual que `stock.bodega_model_id`: la pieza puede llegar después.
- **Lectura desde la Bodega** (etapa 3): una función `public.bodega_archivos_de_piezas()`
  `SECURITY DEFINER`, sólo `authenticated`, que devuelve `bodega_model_id, nombre, tamano, hash,
  actualizado_en, ruta, miniatura_ruta` del tenant `sendero3d`. Y una política de `storage.objects`
  para `SELECT` de `authenticated` en `bucket_id = 'archivos-3d' AND name LIKE 'piezas/%'`, para que
  la Bodega pida su link firmado con su propia sesión. La biblioteca suelta (`archivos/...`) sigue
  sólo para el servidor.
- **Pieza nueva desde el ERP** (etapa 2): `INSERT` en `bodega.models` con un UUID del servidor. Hoy
  la tabla la escribe la Bodega; se agrega una columna `origen text DEFAULT 'bodega'` para que la
  Bodega distinga lo que no creó.

## 3. Endpoints

| Método | Ruta | Permiso | Qué hace |
|---|---|---|---|
| GET | `/api/piezas/[id]/archivo` | sesión, sin demo | El archivo de la pieza y un link firmado para verlo o bajarlo |
| POST | `/api/piezas/[id]/archivo` | sesión, sin demo | Prepara la subida (ruta + token firmado); reemplaza si había otro |
| PUT | `/api/piezas/[id]/archivo` | sesión, sin demo | Confirma la subida, guarda tamaño, hash y miniatura, borra el anterior |
| POST | `/api/productos/alta` | sesión, sin demo | Crea producto + pieza + fila de stock enganchada en una transacción; devuelve el id de la pieza para subir el archivo |

Los gramos y el tiempo leídos del 3MF no tienen endpoint propio: el navegador los manda con el
`PUT` o con el alta, y se aplican a la receta sólo si el usuario confirma (RN-4 de la spec 001).

## 4. Páginas y componentes

| Ruta / componente | Tipo | Notas |
|---|---|---|
| `src/lib/leer-3mf.ts` | pura | Port de `storage.ts:17` con `unzipSync` de `three/examples/jsm/libs/fflate.module.js` y `filter` para descomprimir sólo `slice_info.config` y las miniaturas. Con pruebas sobre 3MF reales chicos. |
| `src/components/producto/archivo-de-pieza.tsx` | client | Miniatura, visor 3D (el de `components/archivos/visor-3d.tsx`), bajar, subir o reemplazar con progreso. Va en la página del producto, por pieza. |
| `src/components/producto/alta.tsx` | client | Reemplaza el diálogo de `modelos/page.tsx:531`: zona para soltar el archivo, nombre, serie, material, y el resultado de `cotizar()`. |
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
| Las 13 carpetas sin pieza son pruebas viejas | Se suben sueltas a "Sin pieza" o se dejan afuera, según decida Agustín. |

## 10. Documentación a actualizar

- [ ] `01 - Inventario/INV - Flujos.md`: alta de producto, archivo de pieza, endpoints nuevos.
- [ ] `03 - Bodega/BOD - Flujos.md`: canales IPC nuevos (descargar, abrir en Bambu Studio, caché) y
  "Dónde viven los datos".
- [ ] `Flujos del ecosistema.md`: el contrato de piezas se da vuelta (el ERP crea, la Bodega lee).
- [ ] `INV - Changelog`, `BOD - Changelog`, `INV - Decisiones`.
