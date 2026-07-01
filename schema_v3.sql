-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise v3.0 — Schema completo Supabase
-- EJECUTAR EN: Supabase → SQL Editor → New Query → RUN
-- ═══════════════════════════════════════════════════════

-- Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── TENANTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  nit        TEXT,
  tel        TEXT,
  email      TEXT,
  address    TEXT,
  logo_base64 TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── LICENCIAS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.licencias (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo              TEXT DEFAULT 'demo',
  activa            BOOLEAN DEFAULT true,
  codigo            TEXT,
  fecha_inicio      DATE DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  activada_por      TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ── CONFIG FISCAL ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.config_fiscal (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  regimen_iva TEXT DEFAULT 'general',
  tasa_iva    NUMERIC DEFAULT 0.12,
  tasa_isr    NUMERIC DEFAULT 0.05,
  fel_nit     TEXT,
  fel_usuario TEXT,
  fel_password TEXT,
  fel_ambiente TEXT DEFAULT 'pruebas',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── USUARIOS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usuarios (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre                TEXT NOT NULL,
  email                 TEXT NOT NULL,
  rol                   TEXT DEFAULT 'recepcionista',
  telefono              TEXT,
  avatar                TEXT DEFAULT '👤',
  activo                BOOLEAN DEFAULT true,
  debe_cambiar_password BOOLEAN DEFAULT false,
  permisos_custom       JSONB,
  ultimo_login          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ── CLIENTES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo           TEXT DEFAULT 'individual',
  nombre         TEXT NOT NULL,
  nombre_empresa TEXT,
  representante  TEXT,
  nit            TEXT DEFAULT 'CF',
  tel            TEXT,
  email          TEXT,
  direccion      TEXT,
  notas          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ── VEHÍCULOS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehiculos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id  UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  placa       TEXT NOT NULL,
  marca       TEXT NOT NULL,
  modelo      TEXT NOT NULL,
  anio        INTEGER,
  color       TEXT,
  combustible TEXT DEFAULT 'Gasolina',
  kilometraje INTEGER DEFAULT 0,
  motor       TEXT,
  vin         TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── EMPLEADOS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empleados (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  cargo         TEXT,
  rol           TEXT DEFAULT 'mecanico',
  tel           TEXT,
  email         TEXT,
  dpi           TEXT,
  igss          TEXT,
  fecha_ingreso DATE,
  salario_base  NUMERIC DEFAULT 0,
  bonificacion  NUMERIC DEFAULT 250,
  activo        BOOLEAN DEFAULT true,
  foto          TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ── ÓRDENES DE TRABAJO ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  num              TEXT,
  vehiculo_id      UUID REFERENCES public.vehiculos(id) ON DELETE SET NULL,
  cliente_id       UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  mecanico_id      UUID REFERENCES public.empleados(id) ON DELETE SET NULL,
  descripcion      TEXT,
  diagnostico      TEXT,
  estado           TEXT DEFAULT 'recibido',
  prioridad        TEXT DEFAULT 'media',
  fecha_ingreso    DATE DEFAULT CURRENT_DATE,
  fecha_estimada   DATE,
  fecha_entrega    DATE,
  km_ingreso       INTEGER,
  total            NUMERIC DEFAULT 0,
  adelanto         NUMERIC DEFAULT 0,
  saldo            NUMERIC DEFAULT 0,
  fotos_recepcion  JSONB,
  notas_internas   TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── INVENTARIO ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventario (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  bodega_id   UUID,
  codigo      TEXT,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  categoria   TEXT,
  marca       TEXT,
  unidad      TEXT DEFAULT 'unidad',
  stock       NUMERIC DEFAULT 0,
  min_stock   NUMERIC DEFAULT 5,
  precio_costo  NUMERIC DEFAULT 0,
  precio_venta  NUMERIC DEFAULT 0,
  ubicacion   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, codigo)
);

-- ── INVENTARIO MOVIMIENTOS ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventario_movimientos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  inventario_id UUID REFERENCES public.inventario(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  cantidad      NUMERIC NOT NULL,
  costo_unit    NUMERIC DEFAULT 0,
  referencia    TEXT,
  notas         TEXT,
  fecha         DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── PROVEEDORES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proveedores (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  nit         TEXT,
  contacto    TEXT,
  tel         TEXT,
  email       TEXT,
  direccion   TEXT,
  categoria   TEXT,
  notas       TEXT,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── BANCOS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bancos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  banco       TEXT,
  tipo        TEXT DEFAULT 'monetaria',
  numero      TEXT,
  moneda      TEXT DEFAULT 'GTQ',
  saldo_inicial NUMERIC DEFAULT 0,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── BANCO MOVIMIENTOS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.banco_movimientos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  banco_id    UUID REFERENCES public.bancos(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  concepto    TEXT NOT NULL,
  monto       NUMERIC NOT NULL,
  referencia  TEXT,
  fecha       DATE DEFAULT CURRENT_DATE,
  conciliado  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── INGRESOS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ingresos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  concepto    TEXT NOT NULL,
  categoria   TEXT,
  monto       NUMERIC NOT NULL,
  referencia  TEXT,
  orden_id    UUID REFERENCES public.ordenes(id) ON DELETE SET NULL,
  cliente_id  UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  fecha       DATE DEFAULT CURRENT_DATE,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── EGRESOS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.egresos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  concepto      TEXT NOT NULL,
  categoria     TEXT,
  monto         NUMERIC NOT NULL,
  proveedor_id  UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  referencia    TEXT,
  fecha         DATE DEFAULT CURRENT_DATE,
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ── FACTURAS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.facturas (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  num_fel      TEXT,
  serie        TEXT,
  cliente_id   UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  orden_id     UUID REFERENCES public.ordenes(id) ON DELETE SET NULL,
  subtotal     NUMERIC DEFAULT 0,
  iva          NUMERIC DEFAULT 0,
  total        NUMERIC DEFAULT 0,
  estado       TEXT DEFAULT 'emitida',
  uuid_fel     TEXT,
  fecha        DATE DEFAULT CURRENT_DATE,
  notas        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── PAGOS NÓMINA ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_nomina (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  empleado_id     UUID REFERENCES public.empleados(id) ON DELETE CASCADE,
  periodo_mes     INTEGER NOT NULL,
  periodo_anio    INTEGER NOT NULL,
  salario_base    NUMERIC DEFAULT 0,
  bonificacion    NUMERIC DEFAULT 250,
  horas_extra     NUMERIC DEFAULT 0,
  monto_extra     NUMERIC DEFAULT 0,
  igss_laboral    NUMERIC DEFAULT 0,
  isr             NUMERIC DEFAULT 0,
  otras_deduc     NUMERIC DEFAULT 0,
  liquido         NUMERIC DEFAULT 0,
  pagado          BOOLEAN DEFAULT false,
  fecha_pago      DATE,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empleado_id, periodo_mes, periodo_anio)
);

-- ── VIÁTICOS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.viaticos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  empleado_id UUID REFERENCES public.empleados(id) ON DELETE CASCADE,
  concepto    TEXT NOT NULL,
  monto       NUMERIC NOT NULL,
  fecha       DATE DEFAULT CURRENT_DATE,
  tipo        TEXT DEFAULT 'alimentacion',
  referencia  TEXT,
  aprobado    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── EMPLEADO DOCUMENTOS ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empleado_documentos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empleado_id UUID REFERENCES public.empleados(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  numero      TEXT,
  fecha_emision DATE,
  fecha_vencimiento DATE,
  archivo_url TEXT,
  notas       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── BODEGAS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bodegas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  direccion   TEXT,
  responsable TEXT,
  activa      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── COMBOS MARKETING ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.combos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  tipo        TEXT DEFAULT 'servicios',
  precio_regular NUMERIC DEFAULT 0,
  precio_combo   NUMERIC DEFAULT 0,
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── PROMOCIONES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promociones (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  descuento_pct NUMERIC DEFAULT 0,
  combo_id     UUID REFERENCES public.combos(id) ON DELETE SET NULL,
  fecha_inicio DATE,
  fecha_fin    DATE,
  activa       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── CITAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.citas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id  UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  vehiculo_id UUID REFERENCES public.vehiculos(id) ON DELETE SET NULL,
  empleado_id UUID REFERENCES public.empleados(id) ON DELETE SET NULL,
  titulo      TEXT NOT NULL,
  descripcion TEXT,
  fecha_cita  TIMESTAMPTZ NOT NULL,
  duracion_min INTEGER DEFAULT 60,
  estado      TEXT DEFAULT 'pendiente',
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── RLS (Row Level Security) ───────────────────────────
ALTER TABLE public.tenants               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_fiscal         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleados             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bancos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banco_movimientos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingresos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.egresos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_nomina          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viaticos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleado_documentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bodegas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promociones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas                 ENABLE ROW LEVEL SECURITY;

-- ── POLÍTICAS DE ACCESO ────────────────────────────────
-- ⚠️ Las políticas de aislamiento por tenant viven en
--    db/migrations/001_rls_tenant_isolation.sql
-- Tras crear la estructura con este archivo, EJECUTA esa migración.
-- (Sin ella, RLS está activado pero sin políticas → acceso denegado.)
--
-- NO uses políticas abiertas tipo `USING (true)`: exponen todos los
-- datos de todos los talleres a cualquiera con la anon key.

-- Grants base (RLS hace el filtrado real por fila)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

SELECT 'NexusPro v3.0 Schema instalado ✓' AS resultado;
