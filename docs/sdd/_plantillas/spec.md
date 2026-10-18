---
id: 001-<tema>        # igual al nombre del archivo; las tasks lo citan así
feature: NNN-nombre-de-la-feature
titulo: <qué comportamiento define, en una frase>
estado: draft         # draft | validated | implemented | discarded
actualizado: AAAA-MM-DD
---

# <Título>

Una spec define **un comportamiento observable**, chico y verificable. Si para explicarla
hace falta decir "y además…", probablemente son dos specs.

## Contexto
<Qué problema resuelve y para quién. 2-4 líneas.>

## Requisitos
- **REQ-1** — <El sistema debe…>. Una sola cosa por requisito, sin "y".
- **REQ-2** — …

## Reglas de negocio
- **RN-1** — <Números, topes, plazos, fórmulas. Ej.: "comisión = 3% del precio de lista">

## Criterios de aceptación
Cada uno se tiene que poder probar a mano o con un test.
- [ ] **CA-1** — Dado <estado inicial>, cuando <acción>, entonces <resultado>.
- [ ] **CA-2** — …

## Casos borde
- <Qué pasa si… (cancelación, doble click, sin saldo, sin conexión a una API externa)>

## Fuera de alcance
- <Lo que alguien podría suponer que entra y no entra.>

## Preguntas abiertas
- [ ] <Lo que el developer todavía no definió. Una spec con preguntas abiertas no se valida.>

## Referencias
- Código actual: `ruta/archivo.ts:línea`
- Notas: `01 - Inventario/...`, notas transversales relacionadas
