---
feature: 015-ajustes-y-precios
---

# Bitácora · Ajustes de precio por producto y Precios rediseñada

## 2026-11-18 · Claude

Se escribió el SDD (funcional y técnico) con las decisiones de Agustín: % por canal y envío propio,
fecha de fin opcional, a varios productos juntos, pantalla por producto. Falta su validación y las
dos preguntas abiertas antes de escribir código.

## 2026-11-18 · Claude (más tarde)

Validado ("dale, las dos como proponés"). Hecho:

- Tabla `ajustes_precio`, reglas, guardado, endpoints y vista previa. El cálculo toma los ajustes
  vigentes. `scripts/sdd-015-probar-ajustes.ts`: 17 de 17, contra la base, y borra lo que crea.
  En Ajedrez: +10 % ML, +3 % web y −5 % directa llevaron ML de $53.100 a $58.434 publicados, la web
  de $27.890 a $28.790 y la directa de $24.090 a $22.890, con la misma ganancia de base.
- Precios rehecha por producto: tarjetas que filtran (ML, web, venta directa, falta costear), una
  fila por producto con sus tres canales y sus ajustes, ficha al costado con todo lo suyo, y una
  barra para varios productos (Ajustar, Margen, Aplicar). `?modelo=` abre la ficha.
  `scripts/sdd-015-probar-agrupado.ts`: no se pierde ninguna publicación al agrupar.
- INV - Flujos: sección 10d, navegación, ER e índice de endpoints.

Falta: mirarla en el navegador con sesión y publicar con el OK de Agustín.
