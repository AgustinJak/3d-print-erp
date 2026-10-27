---
feature: 005-publicidad-ml
estado: validated
actualizado: 2026-10-26
---

# SDD técnico · Publicidad de Mercado Libre

## 1. Estado actual

- `src/lib/ml-publicidad.ts` lee campañas con su costo del mes para Finanzas › Shay. Queda como
  está.
- El token tiene `urn:ml:mktp:ads:/read-write`. Lectura probada el 2026-10-26: anunciante MLA
  928818, 8 campañas, 198 ad groups.
- La API: `GET /advertising/advertisers?product_id=PADS`;
  `GET /advertising/$SITE/advertisers/$ADV/product_ads/campaigns/search` (métricas, hasta 90 días
  atrás); `GET /advertising/$SITE/product_ads/campaigns/$ID` (agrega `impression_share` y
  `lost_impression_share_by_budget`); `GET .../product_ads/ad_groups/search` (anuncios con
  métricas); `PUT /marketplace/advertising/$SITE/product_ads/campaigns/$ID` (name, budget, status,
  roas_target, strategy); `PUT /marketplace/advertising/$SITE/product_ads/ad_groups/$ID` (status,
  campaign_id). Todo con `api-version: 2`.
- Un ad group es una publicación (ITEM, id = MLA), una familia de User Products (FAMILY, id =
  `family_id`) o un producto de catálogo (CATALOG). Para llegar a la publicación se leen las
  publicaciones que conoce el ERP con `/items?ids=` (`family_id`, `catalog_product_id`, precio).

## 2. Modelo de datos

### Tablas nuevas o cambios

`cambios_publicidad` (`prisma/sql/publicidad-ml.sql`):

| Columna | Tipo | Qué es |
|---|---|---|
| id | text pk | cuid |
| tenant_id | text | |
| tipo | text | `campana` o `anuncio` |
| objetivo_id | text | id de la campaña o del ad group |
| nombre | text | para leerlo sin ir a ML |
| antes | jsonb | los campos que cambian, antes |
| despues | jsonb | lo pedido |
| estado | text | `aplicado` o `error` |
| respuesta | jsonb | lo que contestó ML, o el error |
| origen | text | `pantalla` o `claude` |
| usuario | text | email o "claude" |
| creado_en | timestamptz | |

Índice `(tenant_id, tipo, objetivo_id, creado_en)`.

## 3. Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/publicidad?desde&hasta` | resumen: campañas, anuncios, márgenes, alertas |
| POST | `/api/publicidad/cambios` | vista previa (`aplicar: false`) o aplicar un cambio |
| GET | `/api/publicidad/historial` | los últimos 200 cambios |

## 4. Páginas y componentes

- `src/app/(app)/publicidad/page.tsx`: la página.
- `src/lib/publicidad-ml-api.ts`: cliente de la API de ML (lectura y escritura).
- `src/lib/publicidad-ml.ts`: el resumen, el margen, las reglas de cambio y el registro. Lo usan
  la página y el MCP.
- `scripts/mcp-publicidad.ts`: el servidor MCP (stdio, `@modelcontextprotocol/sdk`).
- `.mcp.json` y `.claude/skills/publicidad-ml/SKILL.md`.
- Menú: "Publicidad" en Negocio; también en la paleta de comandos. Oculto en la demo.

## 5. Permisos

`getAuthenticatedTenantNonDemo` en los tres endpoints. El MCP fija `sendero3d`, como Bodega.

## 6. Integraciones externas

ML Product Ads (arriba). El MCP comparte el token con el ERP desplegado: si los dos refrescan a
la vez, uno usa un refresh token ya gastado. `mlFetch` pasa a releer la cuenta y reintentar
cuando el refresh falla y otro proceso ya guardó un token nuevo.

## 7. Seguridad

- El MCP lee el `.env` local; no expone nada por red (stdio).
- Ninguna escritura sin confirmación: diálogo en la pantalla, permiso de Claude Code en el MCP.

## 8. Pruebas

- Funciones puras del margen y de las reglas: `scripts/sdd-005-probar-publicidad.ts`, como los SDD 003 y 004.
- Lectura real con un script de sólo lectura.
- La primera escritura real, con el OK de Agustín.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Ganancia estimada mal leída como exacta | La pantalla dice "estimada" y explica el cálculo |
| Claude cambia de más | Permiso por llamada, vista previa, aviso de aprendizaje, registro |
| Endpoints de ML que cambian (ya pasó en mayo) | Todo el acceso en un solo archivo |
| Refresh de token simultáneo ERP/MCP | Releer y reintentar (sección 6) |

## 10. Documentación a actualizar

- `INV - Flujos` (página, endpoints, MCP) e `INV - Backlog`.
- `Flujos del ecosistema`: sí, contrato 6b. La sección 6 decía que el precio era la única escritura
  del ERP en ML.
