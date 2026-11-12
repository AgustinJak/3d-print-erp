---
id: 010
feature: segunda-cuenta-ml
estado: validated
creado: 2026-11-12
---

# 010: Una segunda cuenta de Mercado Libre, Sendero Shop

## Qué se quiere

Agustín, el 2026-11-12: abrir una segunda cuenta de Mercado Libre, **Sendero Shop**, con los mismos
productos que Sendero 3D, y manejarla desde el ERP igual que la principal. Y un publicador que copie
las publicaciones de Sendero 3D a Sendero Shop.

- La cuenta principal (Sendero 3D) está a nombre de Tai; Sendero Shop va a estar a nombre de Agustín.
  Son dos vendedores distintos para Mercado Libre.
- Las fotos van iguales a las de Sendero 3D, y el título cambia en su última parte para que no sea
  idéntico (decisión del 2026-11-12: "ya vi que muchos lo hacen").

## Decisiones (Agustín, 2026-11-12)

| Tema | Decisión |
|---|---|
| Precios | Los mismos que Sendero 3D: misma política, opción 1 y opción 2. |
| Finanzas | Cada cuenta por separado (cobrado, publicidad, percepciones, cargos) y el total del negocio. |
| Fotos | Las mismas de la publicación de Sendero 3D. |
| Título | El de Sendero 3D con la última parte cambiada. Lo escribe Agustín en el copiador. |
| Descripción | La misma, editable si quiere cambiarla. |
| Qué se copia | Por tandas que elige Agustín desde Productos. |

## Requisitos

- **REQ-1** Conectar una segunda cuenta de ML al ERP, con su propio permiso (Agustín inicia sesión en
  ML con esa cuenta, como con la principal).
- **REQ-2** Cada publicación sabe de qué cuenta es, y todo lo que el ERP hace con ella (leer y aplicar
  precios, Flex y entrega, promos, publicidad) va a esa cuenta.
- **REQ-3** Las ventas de las dos cuentas entran como pedidos, descuentan el mismo stock y dicen de qué
  cuenta son.
- **REQ-4** Finanzas muestra cada cuenta por separado y el total.
- **REQ-5** Copiar a Sendero Shop: desde Productos, por tandas. Para cada publicación de Sendero 3D, un
  borrador con todo lo de la original (categoría, atributos, tipo, precio, envío, garantía, variaciones,
  fotos, título y descripción). Las fotos y la descripción van iguales; el **título es editable** y
  tiene que quedar distinto del original. Se revisa contra ML sin crear nada y, al confirmar, se crea
  **pausada** y queda mapeada a la misma variante del ERP.

## Reglas

- **RN-1** Nada automático, como siempre en ML: copiar, aplicar precios o cambiar la entrega se
  confirma.
- **RN-2** La cuenta principal no cambia: todo lo que hoy funciona sigue igual para Sendero 3D. Lo que
  no diga la cuenta es de la principal.
- **RN-3** Una venta descuenta el stock del ERP sin importar la cuenta. Las dos publicaciones de una
  misma variante muestran stock en ML a la vez: se maneja como hoy, a pedido o con Flex.
- **RN-4** El título de Sendero Shop no puede ser idéntico al de Sendero 3D: el copiador lo marca y no
  deja crear esa publicación hasta que se cambie. Fotos y descripción pueden ir iguales.
- **RN-5** Shay vende sólo en la cuenta principal: su reparto, sus campañas y sus percepciones no
  cambian.
- **RN-6** El dinero de Sendero Shop entra al Mercado Pago de Agustín: lo cobrado de esa cuenta se lee
  con su propio permiso.

## Lo que hay que saber antes

- **Riesgo con ML.** No hay texto oficial de ML Argentina sobre este caso. Fuentes de terceros dicen
  que publicaciones idénticas, aun en cuentas distintas, pueden darse de baja solas, y que las
  "cuentas duplicadas" son motivo de suspensión. Con dos titulares distintos baja; con las mismas
  fotos queda más expuesto, y fue una decisión consciente de Agustín. No está confirmado por ML.
- **Una cuenta nueva no tiene reputación.** ML suele limitar a los vendedores nuevos (visibilidad,
  cantidad de ventas, plata retenida más días) hasta que juntan ventas. Conviene empezar con pocas
  publicaciones.
- **Flex** se habilita por cuenta: Sendero Shop puede no tenerlo al principio.

## Fuera de alcance

- Publicidad (Product Ads) de la cuenta nueva: se lee y se factura, pero las campañas se arman en ML.
- Una tercera cuenta.
