---
feature: 018-reparto-con-mensajeria
---

# Bitácora · Reparto con mensajería

Diario de sesiones. **Solo se agrega al final, nunca se reescribe.**

---

## 2026-11-23 · Claude (el SDD)

**Pedido de Agustín:** un repartidor que hace sólo algunos envíos: Flex de ML y mensajería de la web,
CABA y sur, a veces norte. Que marque cuáles toma y saber cada lunes cuánto pagarle. Y que la página
se vea bien en el celular.

**Decisiones:**
- se paga lo entregado;
- link del día por WhatsApp, sin usuario;
- extra: cuánto deja cada envío;
- precios por zona de la imagen de SyB Logística: CABA $4.000, $5.800, $8.200, $9.100;
- móvil primero.

**Qué se vio**
- Volumen de los últimos 30 días: unos 100 Flex y 4 de mensajería de la web.
- La dirección de un Flex (`receiver_address`) trae provincia, localidad y CP, pero no el partido. La zona sale por CP, igual que resuelve la web (`envio_syb_zonas` y `buscarZonaSybPorCP` en `Shop/sendero-shop/src/lib/envio-syb.ts`, leído, no tocado).
- El webhook de la web guarda la dirección sólo en el cliente y sólo si estaba vacía: hay que guardarla en el pedido.

## 2026-11-23 · Claude (validación)

Agustín validó:
- el repartidor es otra persona, que cobra con la lista de SyB;
- en la hoja vienen todos tildados;
- Reparto lo usan él y Twai.

## 2026-11-23 · Claude (la app Flex)

Agustín preguntó si alcanza con que el repartidor se baje la app Flex y escanee. Sí:
- escanea en el local y toca "Empezar a repartir";
- si escanea lejos, necesita el código de autorización del vendedor (Preferencias de venta).

No hay "alta". Se corrigió el funcional. La liquidación cruza los Flex marcados "Entregado" con `delivered` en ML.

## 2026-11-23 · Claude (construido)

**Tareas:** TASK-001 a TASK-008 completas; TASK-009 (probar con él y publicar) en curso.

**Qué se hizo**
- Base: `zonas_reparto` (sembradas), `localidades_reparto`, `hojas_reparto`, `envios_reparto` y `liquidaciones_reparto`.
- Zona: la web tiene códigos postales sólo para CABA. El GBA va por partido, que se saca de georef (datos.gob.ar, la misma API del checkout de la web) con el nombre de la localidad que da ML. Las localidades sueltas del mapa ganan sobre el partido.
- La hoja, el link (sólo el hash del token, 48 h), la página del celular, las semanas y las tarifas.

**Problemas**
- La API de ML da la dirección del Flex con calle, número, comentario, nombre y coordenadas; el teléfono viene enmascarado. Por eso en los Flex no aparece "Llamar".
- Las regex escritas desde node -e pierden las barras: el bypass del middleware y una línea de reparto.ts se corrigieron con Edit.

**Para el que sigue**
- Las uniones de zona que difieren de la web: Ituzaingó en la 1 y Guernica y Korn en la 3, según la imagen de SyB. Confirmar con Agustín si cobra distinto.
