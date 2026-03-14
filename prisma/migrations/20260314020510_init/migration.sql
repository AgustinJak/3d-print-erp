-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE_PAGO', 'CONFIRMADO', 'EN_PRODUCCION', 'TERMINADO', 'ENTREGADO', 'ESPERANDO_LIQUIDACION_ML', 'COMPLETADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tamanio_cm" DOUBLE PRECISION,
    "peso_promedio_gr" DOUBLE PRECISION,
    "costo_base_fab" DOUBLE PRECISION NOT NULL,
    "precio_base_venta" DOUBLE PRECISION NOT NULL,
    "precio_credito_porc" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "reglas_descuento" JSONB,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos" (
    "id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "serie" TEXT,
    "peso_gr" DOUBLE PRECISION,
    "notas" TEXT,
    "archivo_3mf_url" TEXT,
    "imagen_url" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
    "cliente_id" TEXT,
    "fecha_pedido" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_entrega" TIMESTAMP(3),
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "metodo_envio" TEXT,
    "metodo_pago" TEXT,
    "precio_envio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "senia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comprobante_url" TEXT,
    "fecha_liquidacion_ml" TIMESTAMP(3),
    "contacto" TEXT,
    "notas" TEXT,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "canal_venta" TEXT NOT NULL DEFAULT 'directa',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "producto_id" TEXT NOT NULL,
    "modelo_id" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_unitario" DOUBLE PRECISION NOT NULL,
    "costo_unitario" DOUBLE PRECISION NOT NULL,
    "ajuste_manual" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "items_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filamentos" (
    "id" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "tipo_material" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "temp_extrusor" INTEGER,
    "temp_cama" INTEGER,
    "velocidad_rec" INTEGER,
    "peso_carrete_gr" DOUBLE PRECISION,
    "peso_restante_gr" DOUBLE PRECISION,
    "costo_por_gr" DOUBLE PRECISION,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido" ADD CONSTRAINT "items_pedido_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "modelos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
