# Especificación del Proyecto - Inventario Sendero 3D

## Objetivo

Aplicación web para gestionar un negocio de impresión 3D. Plataforma de gestión para controlar productos, modelos, pedidos, clientes, materiales y datos financieros.

- **Tipo:** Aplicación web monolítica
- **Deploy:** Vercel
- **Modelo de negocio:** Impresión bajo demanda (no inventario en stock)
- **Idioma de la interfaz:** Español
- **Enfoque:** Velocidad, claridad y gestión eficiente de pedidos

---

## 1. PANEL PRINCIPAL (Dashboard)

Página de resumen operativo. Debe mostrar:

- Total de pedidos en producción
- Pedidos pendientes de pago
- Pedidos listos para entregar
- Pedidos esperando liquidación de MercadoLibre
- Ingresos mensuales
- Costo de fabricación mensual
- Ganancia mensual
- Productos más vendidos
- Próximas fechas de entrega

---

## 2. PRODUCTOS

Un producto representa una categoría de artículo. Ejemplo: *Katana 95cm*

Un producto puede contener múltiples modelos.

### Campos del producto:

| Campo | Descripción |
|---|---|
| ID | Identificador único |
| Nombre | Nombre del producto |
| Tamaño (cm) | Tamaño en centímetros |
| Peso promedio (g) | Peso promedio en gramos |
| Costo base de fabricación | Costo de manufactura |
| Precio base de venta | Precio unitario base |
| Precio crédito | 10% más que el precio base |
| Reglas de precio mayorista | Descuentos por cantidad |
| Notas generales | Observaciones |
| Estado | Activo / Inactivo |

### Sistema de precios:

- Descuento porcentual para promociones
- Promociones con precio fijo
- Precios mayoristas escalonados por cantidad

Ejemplo mayorista:
- 10+ unidades → precio con descuento
- 20+ unidades → descuento mayor

---

## 3. MODELOS

Cada producto puede tener múltiples modelos.

Ejemplo:
- **Producto:** Katana 95cm
- **Modelos:** Katana de Zoro, Katana de Tanjiro, Espada de Sasuke

### Campos del modelo:

| Campo | Descripción |
|---|---|
| ID | Identificador único |
| Referencia al producto | Producto padre |
| Nombre del modelo | Nombre específico |
| Serie / Franquicia | Anime, juego, etc. |
| Peso (g) | Peso en gramos |
| Notas | Observaciones |
| Archivo 3D (.3mf) | Archivo del modelo 3D |
| Imagen de referencia | Foto/render del modelo |

El sistema debe permitir subir y almacenar archivos `.3mf` para acceso rápido al enviar impresiones al slicer de Bambu Lab.

---

## 4. PEDIDOS

Sección central operativa. Representan compras de clientes y tareas de producción.

### Campos del pedido:

| Campo | Descripción |
|---|---|
| ID | Identificador único |
| Nivel de prioridad | Alta, media, baja |
| Referencia al cliente | Cliente asociado |
| Fecha del pedido | Cuándo se realizó |
| Fecha de entrega | Cuándo debe entregarse |
| Estado del pedido | Estado actual |
| Método de envío | Cómo se entrega |
| Método de pago | Cómo paga el cliente |
| Precio de envío | Costo del envío |
| Seña del cliente | Depósito/adelanto |
| Comprobante de pago | Imagen/archivo del comprobante |
| Fecha liquidación ML | Si aplica, fecha de liquidación de MercadoLibre |
| Datos de contacto | Info de contacto |
| Notas | Observaciones |

### Métodos de envío:

- Retiro en local
- Correo Argentino
- Entrega personal
- Envío por MercadoLibre

### Métodos de pago:

- Efectivo
- Débito
- Crédito
- Transferencia bancaria

---

## 5. ÍTEMS DEL PEDIDO

Cada pedido puede contener múltiples ítems.

### Campos:

| Campo | Descripción |
|---|---|
| Producto | Producto seleccionado |
| Modelo | Modelo específico |
| Cantidad | Unidades |
| Precio unitario de venta | Precio por unidad |
| Costo unitario de fabricación | Costo por unidad |
| Ajuste manual de precio | Modificación manual |
| Subtotal | Total del ítem |

---

## 6. ESTADOS DE PEDIDO

| Estado | Descripción |
|---|---|
| Pendiente de pago | Esperando pago del cliente |
| Confirmado | Pago recibido/confirmado |
| En producción | Imprimiéndose |
| Terminado | Listo, pendiente de entrega |
| Entregado | Entregado al cliente |
| Esperando liquidación ML | Entregado, esperando pago de MercadoLibre |
| Completado | Finalizado y cobrado |
| Cancelado | Pedido cancelado |

---

## 7. COLA DE PRODUCCIÓN

Sección de planificación de producción. Muestra:

- Modelos esperando ser impresos
- Cantidad
- Prioridad
- Tiempo estimado de impresión

Permite planificar la carga de trabajo de impresión.

---

## 8. CLIENTES

### Campos:

| Campo | Descripción |
|---|---|
| ID | Identificador único |
| Nombre | Nombre completo |
| Teléfono | Número de contacto |
| Email | Correo electrónico |
| Dirección | Domicilio |
| Notas | Observaciones |
| Historial de pedidos | Pedidos anteriores |

Permite reutilizar datos de clientes rápidamente.

---

## 9. FILAMENTOS

Gestión de materiales de impresión.

### Campos:

| Campo | Descripción |
|---|---|
| Marca | Fabricante del filamento |
| Tipo de material | PLA, PETG, TPU |
| Color | Color del filamento |
| Temperatura extrusor | Temperatura recomendada |
| Temperatura cama | Temperatura de cama |
| Velocidad recomendada | Velocidad de impresión |
| Peso del carrete | Peso total del carrete |
| Peso restante | Filamento disponible |
| Costo por gramo | Para estimar costos |
| Notas | Observaciones |

---

## 10. GESTIÓN FINANCIERA

Seguimiento financiero con estadísticas mensuales y anuales:

- Ingresos totales
- Costo total de fabricación
- Ganancia
- Total de pedidos

---

## 11. SEGUIMIENTO DE GASTOS

### Campos:

| Campo | Descripción |
|---|---|
| Fecha | Fecha del gasto |
| Categoría | Tipo de gasto |
| Monto | Cantidad |
| Descripción | Detalle |

### Categorías de ejemplo:

- Filamento
- Mantenimiento de impresora
- Empaquetado
- Envío
- Electricidad

Los gastos se restan de las ganancias mensuales.

---

## 12. HISTORIAL DE PEDIDOS

Los pedidos completados se almacenan históricamente. Filtrado por:

- Mes
- Año
- Producto
- Cliente
- Canal de venta (Venta directa, MercadoLibre)

---

## 13. LÓGICA DE INTEGRACIÓN CON MERCADOLIBRE

Flujo de trabajo:

1. Se produce una venta en MercadoLibre → se crea un pedido automáticamente
2. El pedido permanece activo durante producción y envío
3. Una vez entregado → estado "Esperando liquidación de MercadoLibre"
4. Después de ~8 días, cuando ML libera el dinero → estado "Completado"

Esto evita contabilizar ingresos antes de recibir el pago real.

---

## 14. GESTIÓN DE ARCHIVOS

Archivos soportados:

- Archivos de modelos 3D (.3mf)
- Imágenes de productos
- Imágenes de comprobantes de pago

---

## 15. SISTEMA DE ETIQUETAS

Los pedidos soportan etiquetas para organización:

- `urgente`
- `regalo`
- `mayorista`
- `cliente recurrente`

---

## 16. LÓGICA DE NEGOCIO

Cálculos automáticos:

- **Costo total de fabricación** del pedido
- **Ingreso total** del pedido
- **Ganancia del pedido** = precio_total_venta - costo_total_fabricación

Los valores se calculan automáticamente para evitar errores manuales.

---

## 17. OBJETIVOS GENERALES DE DISEÑO

- Simplicidad
- Velocidad en el ingreso de pedidos
- Claridad en la carga de trabajo de producción
- Seguimiento financiero preciso

Optimizado para gestionar un pequeño negocio de impresión 3D que opera principalmente con pedidos personalizados en lugar de inventario en stock.

---

## Stack Técnico

- **Framework:** Next.js 15 (App Router)
- **Lenguaje:** TypeScript
- **Base de datos:** Supabase (PostgreSQL)
- **ORM:** Prisma
- **UI:** Tailwind CSS + shadcn/ui
- **Autenticación:** Supabase Auth (usuarios creados manualmente, sin registro público)
- **Storage:** Supabase Storage (archivos .3mf, imágenes, comprobantes)
- **Formularios:** React Hook Form + Zod
- **Deploy:** Vercel
- **Idioma UI:** Español
- **Arquitectura:** Monolito web

## Decisiones de Diseño

- **Tema:** Claro y oscuro con toggle
- **Color principal:** Violeta (con degradaciones y colores complementarios)
- **Navegación:** Sidebar lateral
- **MercadoLibre:** Ingreso manual de pedidos (sin integración API por ahora)
- **Acceso:** Privado, solo usuarios autorizados (login con email/contraseña)
