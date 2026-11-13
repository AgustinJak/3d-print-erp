---
id: 011
feature: cuentas-y-rediseno
estado: validated
creado: 2026-11-13
---

# 011: Elegir la cuenta de ML en cada sección, y el rediseño

## Qué se quiere

Agustín, el 2026-11-12, para terminar de refinar la segunda cuenta (docs/sdd/010):

1. Arriba de cada sección donde se hacen cambios, elegir a qué cuenta le afectan: **Sendero 3D**,
   **Sendero Shop** o **Todas**. Así un cambio en los productos toca una sola cuenta o las dos.
2. Mirando **Todas**, que cada producto diga qué tiene activado cada cuenta.
3. Remodelar el frente de las secciones más usadas: hoy "es todo muy Excel". Más moderno, con
   animaciones fluidas y todo bien ordenado.

## Decisiones (Agustín, 2026-11-12)

| Tema | Decisión |
|---|---|
| Orden | Productos primero (selector, vista "Todas" y rediseño juntos); después las demás. |
| Cuenta al entrar | Todas. |
| Qué se rediseña | Retoques en toda la web; sobre todo Productos, Precios, Pedidos e Historial, el Panel de inicio y Finanzas. |
| Animaciones | La librería que parezca mejor: se instaló `motion`. |

## Reglas

- **RN-1.** La cuenta elegida es una sola para todo el ERP: se elige arriba de cada sección y se
  mantiene al pasar de una a otra. Al entrar de nuevo arranca en Todas. Con una sola cuenta de ML
  conectada, el selector no aparece y todo es como antes.
- **RN-2.** La cuenta elegida filtra y limita: lo que se ve de ML y las publicaciones que toca cada
  acción (Flex, días de entrega) son las de esa cuenta.
- **RN-3.** Antes de aplicar un cambio se dice a cuántas publicaciones de cada cuenta le llega.
- **RN-4.** Mirando Todas, cada cuenta tiene su columna con lo mismo: estado, tipo, Flex, días y
  precio. Lo que no está igual entre las dos (Flex, días, precio) se marca, y se puede filtrar.
  Que la copia falte o esté pausada no es una diferencia: se ve aparte ("Sin copiar", "pausada").
- **RN-5.** Crear en ML crea en Sendero 3D; a Sendero Shop se llega copiando (docs/sdd/010). Mirando
  Sendero Shop no se ofrece crear; mirando Sendero 3D no se ofrece copiar.
- **RN-6.** Cada cuenta tiene siempre el mismo color (Sendero 3D violeta, Sendero Shop verde azulado).

## Lo que queda para después

- "Igualar a Sendero 3D": llevar Flex, días y precio de la principal a la copia, con confirmación.
- El selector y el rediseño en Precios, Promos, Pedidos e Historial, el Panel y Finanzas.
- Publicidad sigue siendo sólo de Sendero 3D: la otra cuenta no tiene campañas conectadas.
