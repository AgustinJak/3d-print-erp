---
feature: 005-publicidad-ml
---

# Bitácora · Publicidad de Mercado Libre

Diario de sesiones. Lo último arriba de cada día; los días en orden.

---

## 2026-10-26 · Claude (sesión del inventario) — investigación y SDD

- Investigado con Agustín: la lectura de Product Ads ya andaba (permiso de sólo lectura, usado
  por Finanzas › Shay). La API permite escribir: presupuesto, estado, ROAS objetivo, estrategia,
  y mover o pausar anuncios. La doc de Argentina sólo publica la lectura; la escritura está en la
  de Global Selling, misma API.
- El MCP oficial de ML (`mcp.mercadolibre.com/devsite/v1/mcp`) sólo busca en la documentación.
  Synter y Adspirer (plugins instalados en la sesión) no cubren Mercado Libre.
- Agustín activó "Publicidad de un producto" en lectura y escritura en la app de ML y reconectó
  la cuenta por `/api/ml/oauth/start`, sin desconectar. El token quedó con
  `urn:ml:mktp:ads:/read-write`. Lectura probada después: anunciante 928818, 8 campañas.
- La ruta `/advertising/$SITE/advertisers/$ADV/product_ads/campaigns/search` y la de
  `/marketplace/...` devuelven lo mismo hoy.

## 2026-10-26 · Claude (sesión del inventario) — construido, sin desplegar

**Tareas:** TASK-001 a TASK-009 (→ completed). Falta TASK-010, la primera escritura real.

**Qué se hizo**
- Tabla `cambios_publicidad` (`prisma/sql/publicidad-ml.sql`), aplicada en la base.
- `publicidad-ml-api.ts` (todo el acceso a ML), `publicidad-reglas.ts` (margen, ROAS mínimo,
  alertas, revisión de cambios; 30 de 30 en `scripts/sdd-005-probar-publicidad.ts`) y
  `publicidad-ml.ts` (resumen, vista previa, aplicar con registro, historial).
- Tres endpoints, la página `/publicidad` (menú Negocio y paleta, oculta en la demo), el MCP
  `scripts/mcp-publicidad.ts` con 6 herramientas, `.mcp.json` en el ERP y en `D:\Gestion
  Sendero 3D`, y la skill `publicidad-ml`.
- `mlFetch`: relee la cuenta si el refresh falla porque otro proceso ya lo renovó, y acepta
  `antesDeLeer` para tocar el texto antes del parse.
- Dependencias nuevas de desarrollo, fijas: `@modelcontextprotocol/sdk` 1.32.1 y `tsx` 4.23.15 (el MCP
  arranca con `node --import tsx`, sin `npx`).

**Hallazgos**
- El `family_id` de `/items` es un número de 16 cifras que `JSON.parse` puede redondear: se pasa a
  texto con una regex antes del parse. Sin eso, un anuncio FAMILY no encuentra su publicación.
- La búsqueda de ad groups devuelve también los que no están en ninguna campaña, con
  `campaign_id` 0 (131 de 198). Se muestran aparte como "Sin campaña".
- Un anuncio que cambió de campaña trae sus métricas enteras a la campaña nueva; la vieja queda
  con gasto y sin anuncios ("[A] Collares-Llaveros Kpop"). La cobertura de la ganancia se mide
  contra el gasto de la campaña, no contra la suma de sus anuncios, para que se vea.
- `impression_share` y `lost_impression_share_by_budget/by_ad_rank` son fracciones que suman 1.
- Las métricas de ad groups vuelven en minúscula aunque se pidan en mayúscula.
- El resumen tarda 4 a 7 s (unas 20 llamadas a ML más la base, en paralelo); las publicaciones
  se recuerdan 6 h en memoria.

**Verificación**
- `tsc`, `eslint` y `next build` limpios.
- MCP probado con un cliente MCP real desde el repo y desde la carpeta general: resumen real,
  anuncios, vista previa sin aplicar y un ROAS de 40 rechazado por el esquema.
- La página, sin sesión (el login no lo hace Claude), con una vista temporal bajo `/login` y el
  `fetch` simulado sobre una foto de los datos reales: escritorio, celular de 375 px sin scroll
  horizontal, claro y oscuro, edición y vista previa. Se corrigió el desborde de las métricas en
  el celular y la alineación de columnas. La vista temporal se borró.

**Para el que sigue**
- Commit y deploy sólo cuando Agustín lo pida.
- TASK-010: la primera escritura real, con una campaña que elija él; mirar el historial y el panel
  de ML después. Si ML rechaza el PUT del ad group por el header, probar con `api-version: 2`.

## 2026-10-27 · Claude (sesión del inventario) — en producción

- Con el pedido de Agustín ("dale subilo"): commits `3f89e28` (descartar en Bodega, SDD 004),
  `3ca90a9` (esta feature) y `7bfd1e6` (bitácora 003), a `master`. Vercel: READY en
  producción.
- La publicidad la va a manejar una sesión aparte, con su sección `06 - Publicidad` (prefijo
  `PUB -`) en el cerebro. El prompt con el que arranca está en
  `D:\Gestion Sendero 3D\Prompt - Sesión Publicidad ML.md`. Esa sesión no toca el código: lo que
  necesite del MCP lo pide por su backlog y lo implementa esta sesión.
- Sigue pendiente TASK-010, la primera escritura real.
