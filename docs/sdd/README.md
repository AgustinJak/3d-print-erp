# SDD del Inventario

Cada desarrollo grande del inventario nace acá, como una carpeta con su especificación, antes
de tocar código. La idea es que cualquier persona (o agente) pueda abrir una feature y saber
**qué** se quiere, **por qué**, **cómo** se va a hacer, **en qué orden** y **qué pasó** mientras
se hacía.

Es la misma estructura que usan el Shop (`Shop/sendero-shop/docs/sdd/`) y Bodega
(`Bodega/Bodega3D-App/docs/sdd/`), para que alguien que trabaja en los tres no tenga que aprender
tres formas. Las plantillas se copiaron de Bodega y se adaptaron al inventario.

## Estructura

```
docs/sdd/
├── README.md                  ← este índice
├── _plantillas/               ← copiar, nunca editar en el lugar
│   ├── spec.md
│   ├── sdd-funcional.md
│   ├── sdd-tecnico.md
│   ├── tasks.json
│   ├── tasks.schema.json
│   └── bitacora.md
└── NNN-nombre-de-la-feature/
    ├── specs/                 ← siempre carpeta, aunque haya una sola
    ├── sdd-funcional.md       ← el qué y el porqué, sin código
    ├── sdd-tecnico.md         ← el cómo: datos, endpoints, riesgos
    ├── tasks.json             ← lo último que se crea; se actualiza al avanzar
    └── bitacora.md            ← diario de sesiones
```

**Orden de creación (obligatorio):** specs → SDD funcional → SDD técnico → tasks.json →
bitácora. Después, **validación manual del developer** antes de escribir código.

Cuando una feature necesita que otro sistema cambie (el Shop, Bodega), ese cambio va en una spec
propia (`NNN-cambios-en-el-shop.md`) y lo implementa la sesión de ese sistema.

## Numeración y ramas

- `NNN` es correlativo en todo el repo (001, 002, …), nunca se reutiliza.
- Rama: `feat/NNN-nombre-de-la-feature`, desde `master`.

## Estados de una feature

| Estado | Significa |
|---|---|
| `draft` | Se está escribiendo el SDD. No se toca código. |
| `validated` | El developer revisó los archivos y aprobó. Se puede empezar. |
| `in-progress` | Hay tareas en curso. |
| `blocked` | Una tarea bloqueante sin resolver frena todo. |
| `in-review` | Todas las tareas completas, falta verificarlo en producción. |
| `done` | En producción y verificado. |
| `discarded` | Se decidió no hacerla. Se deja la carpeta como registro. |

## Índice

| ID | Feature | Estado | Rama base |
|---|---|---|---|
| 001 | [mapeo-de-productos](001-mapeo-de-productos/sdd-funcional.md) | validated (2026-10-18) | `master` |
| 002 | disponibilidad-en-canales | planned (después de la 001) | — |

`planned` = pedida y descrita en el SDD funcional de la 001 (sección 8), todavía sin carpeta.
