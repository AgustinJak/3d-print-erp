---
feature: NNN-nombre-de-la-feature
estado: draft            # draft | validated
actualizado: AAAA-MM-DD
---

# SDD técnico · <Nombre de la feature>

El **cómo**. Se escribe después de leer el código real: cada afirmación sobre lo que existe
lleva su `ruta:línea`. El inventario es Next.js (App Router) + Prisma sobre la base de
producción: las páginas son client components que piden todo a `/api/*` (ver `INV - Flujos`),
y los cambios de base van como SQL aditivo en `prisma/sql/` (no hay `prisma migrate`).

## 1. Estado actual
<Qué existe hoy que esta feature toca o reutiliza, con referencias.>

## 2. Modelo de datos
### Tablas nuevas o cambios
```sql
-- Siempre aditivo y compatible hacia atrás: la base es una sola (producción) y las
-- previews de Vercel la comparten. Nada de renombrar/borrar columnas en la misma PR
-- que deja de usarlas.
```
- RLS: <qué políticas, o "sin políticas: solo service role">.
- Archivo versionado: `prisma/sql/<nombre>.sql`, más el modelo en `prisma/schema.prisma`.

## 3. Endpoints
| Método | Ruta | Permiso requerido | Qué hace |
|---|---|---|---|

## 4. Páginas y componentes
| Ruta / componente | Server o client | Permiso | Notas |
|---|---|---|---|

## 5. Permisos
El inventario no tiene catálogo de permisos: sesión de Supabase (`getAuthenticatedTenant`) y
la cuenta demo bloqueada donde corresponda (`getAuthenticatedTenantNonDemo`).

## 6. Integraciones externas
<APIs de terceros, qué pasa si fallan, caché, límites.>

## 7. Seguridad
- <Qué podría hacer mal un usuario con otro rol, y qué lo impide en cada capa.>

## 8. Pruebas
- Lógica pura: tests con fixtures JSON de datos falsos.
- En producción: qué se prueba, con qué datos marcados como prueba, y cómo se limpian.

## 9. Riesgos y mitigaciones
| Riesgo | Mitigación |
|---|---|

## 10. Documentación a actualizar
- [ ] `01 - Inventario/INV - Flujos.md` (si toca páginas, endpoints, navegación, gates o estados)
- [ ] `Flujos del ecosistema.md` si cambia un contrato con el Shop, ML o Bodega
- [ ] Notas de módulo afectadas
- [ ] `INV - Changelog`, `INV - Decisiones` si aplica
