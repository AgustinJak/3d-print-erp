---
name: publicidad-ml
description: Revisar y ajustar la publicidad de Mercado Libre (Product Ads) de Sendero 3D con el margen real de cada producto, usando el MCP local publicidad-ml. Usar cuando Agustín pida mirar campañas de ML, ROAS, presupuesto, qué anuncios pierden plata, qué publicaciones sumar a una campaña, o "revisá la publicidad".
---

# Publicidad de Mercado Libre

Las herramientas vienen del MCP `publicidad-ml` (`scripts/mcp-publicidad.ts`, docs/sdd/005). Usan
el mismo cálculo y las mismas reglas que la página **Publicidad** del ERP, y todo lo que se cambia
queda en el mismo historial, marcado como hecho por Claude.

## Qué significa cada número

- **roas**: ventas atribuidas / gasto.
- **roas_minimo**: el de equilibrio. Sale del precio, el costo de Bodega y lo que cobra ML
  (comisión, cuotas, IIBB, cargo fijo, envío). Debajo, cada venta por publicidad pierde plata.
  Es *el* número para decidir, no el ACOS que muestra ML.
- **ganancia_estimada**: ventas × margen − gasto. Es estimada (las ventas indirectas se cuentan
  con el margen del anuncio). Mirá **cobertura**: qué parte del gasto tiene costo conocido.
- **perdido_por_presupuesto**: impresiones que no ganó por falta de presupuesto (0,24 = 24 %).
- **es_shay**: campaña de Shay Juguetes, otro negocio en la misma cuenta. No tiene costo en el ERP.
  No se toca salvo que Agustín lo pida.

## Cómo revisar

1. `resumen_publicidad` con `30d` para la tendencia y `7d` para lo reciente.
2. Por cada campaña de Sendero, en este orden:
   - **Gasta sin vender** o **roas < roas_minimo**: pierde plata. Abrí `anuncios_de_campana` y
     buscá qué anuncios la arrastran. Opciones, de menor a mayor: pausar esos anuncios, subir el
     ROAS objetivo por encima del mínimo, bajar el presupuesto, pausar la campaña.
   - **Rinde (roas ≥ roas_minimo con margen) y perdido_por_presupuesto alto**: candidata a más
     presupuesto, de a pasos de 20 a 30 %.
   - Un ROAS objetivo por debajo del roas_minimo le permite a ML vender a pérdida: proponé subirlo.
3. `publicaciones_sin_campana`: las que tienen buen margen (roas_minimo bajo) se pueden sumar a la
   campaña de su rubro con `cambiar_anuncio` y `campana_id`.
4. Con pocos datos (menos de ~10 clics o un par de días) no hay conclusión: decilo y esperá.

## Cómo cambiar

- **Primero la vista previa**: `cambiar_campana` o `cambiar_anuncio` sin `aplicar`. Mostrale a
  Agustín una tabla corta (qué, antes → después, por qué, qué esperás que pase).
- **Aplicar sólo con su OK explícito**, con la misma llamada y `aplicar: true`. Claude Code además
  le pide permiso en cada llamada.
- `confirmado_aparte: true` sólo si él lo confirmó: presupuesto que cambia más de 50 % o campaña de
  Shay.
- **Pocos cambios**: cada cambio de campaña la vuelve a poner en aprendizaje unos días. Mirá
  `ultimo_cambio` y `historial_cambios`: no toques una campaña cambiada hace menos de 7 días salvo
  que esté perdiendo plata.
- Después de aplicar, contá qué quedó y cuándo conviene volver a mirar.

## Cómo escribirle

Castellano rioplatense, sin jerga de marketing. "Esta campaña gastó $31.000 y no vendió nada" en
vez de "CVR nulo". Los números en pesos, redondeados. Nunca digas "impresión 3D" en textos que
vayan a ML o a la web.
