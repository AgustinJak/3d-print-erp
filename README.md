# 3D Print ERP - Sendero 3D

Sistema de gestión (ERP) para un negocio de impresión 3D bajo demanda. Diseñado para controlar productos, modelos, pedidos, clientes, materiales y finanzas desde una única plataforma web.

## Sobre el proyecto

Esta aplicación fue creada para gestionar **Sendero 3D**, un emprendimiento de impresión 3D que opera con pedidos personalizados (print-on-demand). El sistema reemplaza planillas de cálculo y notas sueltas con una plataforma centralizada, accesible desde cualquier dispositivo.

### Funcionalidades principales

- **Dashboard** - Vista general del negocio: pedidos activos, finanzas del mes, productos más vendidos, próximas entregas
- **Productos y Modelos** - Catálogo de productos con múltiples modelos por producto, archivos .3mf y precios
- **Pedidos** - Gestión completa de pedidos con estados, prioridades, etiquetas, comprobantes de pago y cálculo automático de ganancias
- **Cola de Producción** - Planificación de impresión con prioridades y tiempos estimados
- **Clientes** - Base de datos de clientes con historial
- **Filamentos** - Control de stock de materiales con seguimiento de peso restante
- **Finanzas** - Ingresos, costos de fabricación, billetera de reinversión y estadísticas mensuales/anuales
- **Gastos** - Registro de gastos del negocio que se descuentan de la billetera de fabricación
- **Historial** - Archivo de pedidos completados con filtros avanzados
- **Storage** - Almacenamiento de archivos .3mf, imágenes de productos y comprobantes de pago

### Lógica de negocio

El sistema maneja dos conceptos financieros clave:
- **Ganancia** = Ingresos - Costo de fabricación
- **Billetera de fabricación** = Acumula los costos de fabricación de cada venta para reinvertir en materiales. Todos los gastos del negocio se descuentan de esta billetera.

## Stack tecnológico

| Tecnología | Uso |
|---|---|
| [Next.js 15](https://nextjs.org/) | Framework web (App Router) |
| [TypeScript](https://www.typescriptlang.org/) | Lenguaje |
| [Prisma](https://www.prisma.io/) | ORM |
| [Supabase](https://supabase.com/) | Base de datos (PostgreSQL), Auth y Storage |
| [Tailwind CSS](https://tailwindcss.com/) | Estilos |
| [shadcn/ui](https://ui.shadcn.com/) | Componentes UI |
| [Vercel](https://vercel.com/) | Deploy |

## Configuración local

### Prerrequisitos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com/) (tier gratuito)

### Instalación

1. Clonar el repositorio:
```bash
git clone https://github.com/AgustinJak/3d-print-erp.git
cd 3d-print-erp
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env.local
```

Completar `.env.local` con las credenciales de Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
```

4. Ejecutar migraciones de la base de datos:
```bash
npx prisma migrate deploy
npx prisma generate
```

5. Crear los buckets de storage en Supabase:
```bash
npx tsx scripts/setup-storage.ts
```

6. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`.

### Acceso

El sistema es privado. Los usuarios se crean manualmente desde el panel de Supabase (Authentication > Users). No hay registro público.

## Deploy

El proyecto está configurado para deploy en Vercel. Conectar el repositorio de GitHub a Vercel y configurar las variables de entorno.

## Estructura del proyecto

```
src/
├── app/
│   ├── (app)/              # Páginas protegidas
│   │   ├── page.tsx        # Dashboard
│   │   ├── pedidos/        # Gestión de pedidos
│   │   ├── productos/      # Catálogo de productos
│   │   ├── modelos/        # Modelos 3D
│   │   ├── clientes/       # Base de clientes
│   │   ├── produccion/     # Cola de producción
│   │   ├── filamentos/     # Stock de materiales
│   │   ├── finanzas/       # Panel financiero
│   │   ├── gastos/         # Registro de gastos
│   │   └── historial/      # Pedidos completados
│   ├── api/                # API routes
│   └── login/              # Página de login
├── components/             # Componentes reutilizables
├── lib/                    # Utilidades y configuración
└── middleware.ts           # Protección de rutas
```

## Autor

**Agustín Jaksetic**
- LinkedIn: [agustin-jaksetic](https://www.linkedin.com/in/agustin-jaksetic-56907a24a/)
- GitHub: [AgustinJak](https://github.com/AgustinJak)

## Licencia

Este proyecto es de uso privado.
