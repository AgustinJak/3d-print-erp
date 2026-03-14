-- Agregar tenant_id a todas las tablas
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'sendero3d';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'sendero3d';
ALTER TABLE modelos ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'sendero3d';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'sendero3d';
ALTER TABLE filamentos ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'sendero3d';
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'sendero3d';

-- Tabla de perfiles para mapear user_id -> tenant_id
CREATE TABLE IF NOT EXISTS perfiles (
  user_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'sendero3d',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_productos_tenant ON productos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_modelos_tenant ON modelos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant ON pedidos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_filamentos_tenant ON filamentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gastos_tenant ON gastos(tenant_id);
