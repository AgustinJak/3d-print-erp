---
id: 006-recetas-desde-el-erp
feature: 001-mapeo-de-productos
titulo: Qué consume cada combinación se arma desde el ERP, sin scripts
estado: validated
actualizado: 2026-10-18
---

# Recetas desde el ERP

## Contexto
Crear una katana nueva hoy necesita ayuda: la pieza nace en Bodega y aparece sola en el ERP con
su fila de stock (`src/lib/altas-bodega.ts`), pero **qué funda lleva** vive en `reglas_insumo` y
esa tabla no tiene pantalla: las 33 recetas se cargaron con scripts. Lo mismo pasa con el
exhibidor de la Kitetsu. Pedido de Agustín (2026-10-18): poder armarlo solo.

## Requisitos
- **REQ-1** — Cada combinación debe mostrar qué consume: la pieza (su fila de stock) y los
  insumos de su receta, con la cantidad.
- **REQ-2** — Se debe poder agregar, cambiar o quitar un insumo de una combinación eligiéndolo de
  una lista.
- **REQ-3** — En un modelo debe existir "Agregar accesorio" (funda, exhibidor u otro): crea las
  variantes "Con <accesorio>" y "Sin <accesorio>" si no están, sus combinaciones, y pide elegir
  el insumo de la combinación "Con".
- **REQ-4** — Una combinación "Con <accesorio>" sin insumo elegido debe verse como pendiente, en
  el modelo y en la lista de modelos.
- **REQ-5** — Cambiar una receta debe volver a repartir el stock, para que los pedidos abiertos
  reserven lo nuevo.

## Reglas de negocio
- **RN-1** — La lista de insumos son las filas de stock de los modelos de la categoría
  **Insumos**, aunque estén inactivos: lo están a propósito, para no figurar como productos. Al
  2026-10-18 son 10 fundas (la de 65 cm de Demon Slayer la usan 16 recetas; la de 95, 8); el
  exhibidor de la Kitetsu todavía no existe. Un insumo nuevo nace igual que hoy: pieza en Bodega →
  alta automática en el ERP → se le pone categoría Insumos.
- **RN-2** — La receta se guarda en `reglas_insumo` con `requiere` = las variantes de la
  combinación. Así el reparto no cambia: es la misma regla que hoy, sólo que ahora se carga desde
  una pantalla.
- **RN-3** — El insumo **no limita la venta** (regla de `Stock unificado`): si falta, el pedido
  entra igual, muestra "falta funda" y la funda aparece en "Faltan" del celular.
- **RN-4** — El adicional de costo de "Con <accesorio>" sale del costo del insumo, como ya lo
  calcula `sincronizar-costos.ts`; la pantalla lo muestra y no se carga a mano.
- **RN-5** — Un insumo se puede compartir entre muchas combinaciones (la "Funda 95 Demon Slayer"
  la llevan varias katanas) y una combinación puede llevar más de uno.

## Criterios de aceptación
- [ ] **CA-1** — Dada la "Tanjiro Katana nueva 95cm", cuando se toca "Agregar accesorio" → Funda
  y se elige "Funda 95 Demon Slayer", entonces la combinación "Con Funda" muestra la hoja y la
  funda, y la "Sin Funda" sólo la hoja.
- [ ] **CA-2** — Dado un pedido abierto de esa katana con funda, cuando se guarda la receta,
  entonces el pedido pasa a reservar también la funda (o a mostrar que falta).
- [ ] **CA-3** — Dada la Kitetsu con "Con Exhibidor" sin insumo, entonces aparece como pendiente
  hasta elegir el exhibidor.
- [ ] **CA-4** — Una katana nueva se arma de punta a punta sin scripts: pieza en Bodega, alta
  automática, "Agregar accesorio" y elegir la funda.

## Casos borde
- Quitar el insumo de una receta con pedidos abiertos: se reparte de nuevo; lo ya consumido es
  historia.
- Desactivar un insumo que usan recetas: se avisa cuáles combinaciones quedan pendientes.
- Un modelo con dos accesorios (funda y exhibidor): hoy no existe; si aparece, las combinaciones
  de más de un eje se crean a mano (spec 001).

## Fuera de alcance
- Que Bodega elija la funda (sigue siendo de piezas, no de productos).
- Recetas de la pieza principal (qué partes imprimir para una katana): Bodega ya tiene un modelo
  por pieza.

## Preguntas abiertas
Ninguna.

## Referencias
- `prisma/schema.prisma:537` (`ReglaInsumo`)
- `src/lib/reservas.ts:242` (cómo el reparto aplica las recetas)
- `src/lib/altas-bodega.ts` (alta automática desde Bodega)
- `src/lib/sincronizar-costos.ts` (adicional de costo desde la receta)
