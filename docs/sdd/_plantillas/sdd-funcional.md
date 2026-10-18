---
feature: NNN-nombre-de-la-feature
epica: E00-nombre        # o "ninguna"
estado: draft            # draft | validated
autor: <developer>
actualizado: AAAA-MM-DD
---

# SDD funcional · <Nombre de la feature>

El **qué** y el **porqué**, escrito para alguien que no lee código. Si una sección no
aplica, se deja con "No aplica" y una línea de por qué; no se borra.

## 1. Objetivo
<Qué cambia para el negocio cuando esto esté en producción. 3-5 líneas.>

## 2. Actores y permisos
| Actor | Qué puede hacer en esta feature |
|---|---|
| Admin (dueños) | … |
| Editor | … |

## 3. Flujos
Uno por recorrido, en pasos numerados. Si hay un diagrama, mermaid (toda etiqueta con `/`,
`(`, `)`, `[`, `]`, `:` o coma va entre comillas).

### 3.1 <Nombre del flujo>
1. …

## 4. Reglas de negocio
Las globales de la feature. Las que son de una sola spec van en esa spec.
- **RN-1** — …

## 5. Pantallas
| Pantalla | Quién la ve | Qué muestra | Qué permite |
|---|---|---|---|

## 6. Specs
| Spec | Qué define |
|---|---|
| [001-…](specs/001-….md) | … |

## 7. Fuera de alcance
- …

## 8. Dependencias
- Features previas: …
- Deuda técnica que hay que resolver antes o dentro de esta feature: DT-…

## 9. Decisiones tomadas
| Fecha | Decisión | Por qué | Quién |
|---|---|---|---|

## 10. Preguntas abiertas
- [ ] …
