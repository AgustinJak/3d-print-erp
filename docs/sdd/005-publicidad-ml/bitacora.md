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

## 2026-10-27 · Claude (sesión del inventario) — ML rechaza las escrituras

- Agustín probó desde la página: pausar el anuncio del vaso BTS (2 veces) y subir el ROAS
  objetivo de "[A] Vasos" de 2 a 3. Las tres volvieron con **401 "User does not have permission
  to write."** Quedaron en `cambios_publicidad` con estado `error`; en ML no cambió nada.
- Diagnóstico, sin cambiar nada en ML (PUT con cuerpo vacío, que ML no puede aplicar):
  - Campañas y anuncios dan el mismo 401, con y sin `api-version: 2`. El de campañas viene de
    `mclics.campaigns.exceptions.UnauthorizedException`: lo dice el sistema de campañas de ML.
  - El token tiene `urn:ml:mktp:ads:/read-write` y `write`; `/users/me` es SENDERO3D
    (1266492194), la dueña de la cuenta y del anunciante.
  - La falta del permiso funcional da otro error (403 `PA_UNAUTHORIZED_RESULT_FROM_POLICIES`,
    según la doc de permisos funcionales).
  - La doc de Argentina y la de Brasil publican sólo la lectura de Product Ads; la escritura está
    sólo en la de Global Selling. Dos proyectos de terceros (MLB y MCO) no llegaron a confirmar
    escrituras de un vendedor local.
- También sin `/marketplace` (`PUT /advertising/MLA/product_ads/...`): mismo 401. Las lecturas
  andan por las dos rutas.
- Agustín pasó la doc de permisos funcionales: el permiso de Publicidad "permite su aplicación
  acceder, crear y gestionar campañas". O sea que, según ML, debería andar. La causa está de su
  lado y no se ve desde afuera: se le pregunta a Soporte para Integradores. TASK-010 queda
  bloqueada por eso.
- 2026-10-28, respuesta de Soporte para Integradores: en la doc de MLA sólo hay lecturas (GET) de
  Product Ads; el 401 es consistente con que la escritura no esté habilitada ni documentada para
  uso público aunque el token tenga `urn:ml:mktp:ads:/read-write`. Piden usar
  `/advertising/...` en vez de `/marketplace/...` (ya probado: mismo 401) y preguntan si hay una
  habilitación comercial o whitelist de Mercado Ads para escrituras. Agustín les responde con el
  link de Global Selling y pregunta cómo se pide.
- Segunda respuesta de Soporte: en MLA no hay endpoints públicos de escritura y pueden quedar
  bloqueadas por habilitación interna. Para pedirla: ticket técnico en el Developer Partner
  Program, tipo Problema, con APP ID, user_id, advertiser_id, site, endpoint, pedido y respuesta
  completos y horarios, pidiendo la habilitación (whitelist) de escrituras de Product Ads para MLA
  y si está en el roadmap. Reproducción para el ticket, con cuerpo vacío (no cambia nada),
  2026-10-28 03:11 UTC: `x-request-id` c926f8c3-c21e-44ee-b2d5-079170088111 (campaña) y
  e4ba70e8-53d1-4118-a6c3-d6d1de3b5411 (ad group), los dos 401.
- Dato suelto: "[A] Vasos" figura con `last_updated` 2026-10-27 17:41 UTC, un cambio que no salió
  del ERP (los intentos del ERP fallaron todos).

## 2026-10-28 · Claude (sesión del inventario) — modo lectura

- Con Agustín: "dejémoslo lectura y modificaré yo manual en el panel". `ESCRITURA_EN_ML = false`
  en `publicidad-reglas.ts` apaga el envío en un solo lugar: `aplicarCambio` rechaza antes de
  llamar a ML (no deja registro), la página cambia "Editar" por "Planear cambio" y el diálogo
  muestra el antes → después con "Hacelo en Mercado Libre › Mi perfil › Publicidad" (la ruta como
  la escribe la doc de ML) y sin botón de aplicar. El MCP devuelve la vista previa con esa
  indicación, y con `aplicar` contesta que no se puede. La skill avisa lo mismo.
- Verificado con el MCP: la vista previa anda, `aplicar` se rechaza y `cambios_publicidad` sigue
  con los 3 errores del 2026-10-28. Para volver a escribir, alcanza con poner la constante en true.

## 2026-10-28 · Claude (sesión del inventario) — qué conviene hacer

**Tareas:** TASK-011 y TASK-012 (completed). Spec nueva: 004-que-conviene-hacer.

- Agustín eligió recomendaciones con reglas fijas en vez de un chat con la API de Claude dentro del
  ERP (eso costaba una API key aparte, unos US$0,10 a 0,15 por pregunta con Opus 5.5). Para
  preguntar a fondo usa su sesión de Claude Code con el MCP.
- `src/lib/publicidad-recomendaciones.ts`: pausar anuncios que gastan sin vender o venden a
  pérdida clara, subir el ROAS objetivo que está debajo del mínimo, bajar presupuesto o pausar la
  campaña que pierde, subir presupuesto a la que rinde y se queda corta, revisar precios que no
  cierran y sumar publicaciones sin campaña con buen margen. Tarjeta arriba de la página y
  herramienta `que_conviene_hacer` en el MCP.
- Se calculan siempre con 30 días: con 7, el vaso K4os (de los que más venden en 30 días) salía
  para pausar por una semana sin ventas.
- El `last_updated` de las campañas en ML cambia también solo ("Ladrillos shay" a las 6:29, cuatro
  campañas en el mismo minuto): se muestra como dato, no se usa para callar recomendaciones.
- Apareció una campaña nueva, "Cyber Monday", creada a mano el 2026-10-27.
- Con los datos reales del 2026-10-28: 7 recomendaciones. La "Caja Guarda" no cierra por un costo
  de $17.477, que es la receta desproporcionada de Bodega ya anotada en INV - Backlog: el texto lo
  avisa.
