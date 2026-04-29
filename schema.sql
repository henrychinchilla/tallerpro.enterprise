-- ═══════════════════════════════════════════════════════════════
-- TallerPro Enterprise — Schema Completo Supabase
-- Correr completo en: SQL Editor → New Query → RUN
-- ═══════════════════════════════════════════════════════════════

-- ─── EXTENSIONES ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── LIMPIAR SI EXISTE ────────────────────────────────────────
DROP TABLE IF EXISTS public.inv_movimientos  CASCADE;
DROP TABLE IF EXISTS public.ot_repuestos     CASCADE;
DROP TABLE IF EXISTS public.ot_servicios     CASCADE;
DROP TABLE IF EXISTS public.facturas         CASCADE;
DROP TABLE IF EXISTS public.nomina           CASCADE;
DROP TABLE IF EXISTS public.asistencia       CASCADE;
DROP TABLE IF EXISTS public.citas            CASCADE;
DROP TABLE IF EXISTS public.inventario       CASCADE;
DROP TABLE IF EXISTS public.ordenes          CASCADE;
DROP TABLE IF EXISTS public.empleados        CASCADE;
DROP TABLE IF EXISTS public.vehiculos        CASCADE;
DROP TABLE IF EXISTS public.clientes         CASCADE;
DROP TABLE IF EXISTS public.tenant_users     CASCADE;
DROP TABLE IF EXISTS public.tenants          CASCADE;

-- ─── TENANTS ─────────────────────────────────────────────────
CREATE TABLE public.tenants (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  nit              TEXT,
  plan             TEXT DEFAULT 'starter' CHECK (plan IN ('starter','pro','enterprise')),
  email            TEXT,
  tel              TEXT,
  address          TEXT,
  logo_url         TEXT,
  active           BOOLEAN DEFAULT TRUE,
  fel_certificador TEXT DEFAULT 'INFILE',
  whatsapp_token   TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── USUARIOS ────────────────────────────────────────────────
CREATE TABLE public.tenant_users (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_user_id UUID,
  nombre       TEXT NOT NULL,
  email        TEXT NOT NULL,
  rol          TEXT NOT NULL CHECK (rol IN ('admin','recepcionista','jefe','mecanico','cliente')),
  cargo        TEXT,
  tel          TEXT,
  avatar       TEXT,
  activo       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ─── CLIENTES ────────────────────────────────────────────────
CREATE TABLE public.clientes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  nit        TEXT,
  dpi        TEXT,
  email      TEXT,
  tel        TEXT,
  tel2       TEXT,
  direccion  TEXT,
  notas      TEXT,
  activo     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── VEHÍCULOS ───────────────────────────────────────────────
CREATE TABLE public.vehiculos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id    UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  placa         TEXT NOT NULL,
  vin           TEXT,
  marca         TEXT NOT NULL,
  modelo        TEXT NOT NULL,
  anio          SMALLINT,
  color         TEXT,
  motor         TEXT,
  transmision   TEXT,
  combustible   TEXT DEFAULT 'gasolina',
  kilometraje   INTEGER DEFAULT 0,
  ultima_visita DATE,
  notas         TEXT,
  fotos         TEXT[],
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── EMPLEADOS ───────────────────────────────────────────────
CREATE TABLE public.empleados (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.tenant_users(id),
  nombre        TEXT NOT NULL,
  dpi           TEXT,
  nit           TEXT,
  fecha_ingreso DATE,
  cargo         TEXT,
  rol           TEXT CHECK (rol IN ('admin','recepcionista','jefe','mecanico','cliente')),
  salario_base  NUMERIC(10,2) DEFAULT 0,
  bonificacion  NUMERIC(10,2) DEFAULT 250.00,
  igss          BOOLEAN DEFAULT TRUE,
  banco         TEXT,
  cuenta_banco  TEXT,
  avatar        TEXT,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── ÓRDENES DE TRABAJO ──────────────────────────────────────
CREATE TABLE public.ordenes (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  num            TEXT NOT NULL,
  vehiculo_id    UUID NOT NULL REFERENCES public.vehiculos(id),
  cliente_id     UUID NOT NULL REFERENCES public.clientes(id),
  mecanico_id    UUID REFERENCES public.empleados(id),
  estado         TEXT DEFAULT 'recibido' CHECK (estado IN ('recibido','diagnostico','en_trabajo','espera_repuestos','listo','entregado','cancelado')),
  prioridad      TEXT DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta','urgente')),
  descripcion    TEXT NOT NULL,
  notas          TEXT,
  km_ingreso     INTEGER,
  fecha_ingreso  DATE DEFAULT CURRENT_DATE,
  fecha_estimada DATE,
  fecha_entrega  DATE,
  total          NUMERIC(10,2) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, num)
);

-- ─── SERVICIOS DE OT ─────────────────────────────────────────
CREATE TABLE public.ot_servicios (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ot_id           UUID NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(8,2) DEFAULT 1,
  precio_unitario NUMERIC(10,2) DEFAULT 0,
  completado      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── INVENTARIO ──────────────────────────────────────────────
CREATE TABLE public.inventario (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  codigo        TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  descripcion   TEXT,
  categoria     TEXT,
  marca         TEXT,
  proveedor     TEXT,
  ubicacion     TEXT,
  stock         INTEGER DEFAULT 0,
  min_stock     INTEGER DEFAULT 2,
  max_stock     INTEGER,
  precio_costo  NUMERIC(10,2) DEFAULT 0,
  precio_venta  NUMERIC(10,2) DEFAULT 0,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, codigo)
);

-- ─── REPUESTOS EN OT ─────────────────────────────────────────
CREATE TABLE public.ot_repuestos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ot_id           UUID NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  repuesto_id     UUID NOT NULL REFERENCES public.inventario(id),
  cantidad        INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── MOVIMIENTOS DE INVENTARIO ────────────────────────────────
CREATE TABLE public.inv_movimientos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  repuesto_id UUID NOT NULL REFERENCES public.inventario(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste','devolucion')),
  cantidad    INTEGER NOT NULL,
  referencia  TEXT,
  notas       TEXT,
  usuario_id  UUID,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── CITAS ───────────────────────────────────────────────────
CREATE TABLE public.citas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id  UUID REFERENCES public.clientes(id),
  vehiculo_id UUID REFERENCES public.vehiculos(id),
  fecha       DATE NOT NULL,
  hora        TIME NOT NULL,
  servicio    TEXT,
  estado      TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmada','cancelada','completada')),
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── FACTURAS FEL ────────────────────────────────────────────
CREATE TABLE public.facturas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  num             TEXT NOT NULL,
  ot_id           UUID REFERENCES public.ordenes(id),
  cliente_id      UUID NOT NULL REFERENCES public.clientes(id),
  nit             TEXT NOT NULL,
  nombre_receptor TEXT,
  fecha           DATE DEFAULT CURRENT_DATE,
  descripcion     TEXT,
  subtotal        NUMERIC(10,2) DEFAULT 0,
  iva             NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) DEFAULT 0,
  estado          TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador','pendiente','certificada','anulada')),
  fel_uuid        TEXT,
  fel_serie       TEXT,
  fel_numero      TEXT,
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, num)
);

-- ─── ASISTENCIA ──────────────────────────────────────────────
CREATE TABLE public.asistencia (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  empleado_id  UUID NOT NULL REFERENCES public.empleados(id),
  fecha        DATE NOT NULL,
  hora_entrada TIME,
  hora_salida  TIME,
  tipo         TEXT DEFAULT 'normal' CHECK (tipo IN ('normal','overtime','falta','vacacion','permiso')),
  notas        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empleado_id, fecha)
);

-- ─── NÓMINA ──────────────────────────────────────────────────
CREATE TABLE public.nomina (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  empleado_id      UUID NOT NULL REFERENCES public.empleados(id),
  periodo          TEXT NOT NULL,
  dias_trabajados  INTEGER DEFAULT 0,
  salario_base     NUMERIC(10,2) DEFAULT 0,
  bonificacion     NUMERIC(10,2) DEFAULT 250,
  otros_ingresos   NUMERIC(10,2) DEFAULT 0,
  igss_laboral     NUMERIC(10,2) DEFAULT 0,
  igss_patronal    NUMERIC(10,2) DEFAULT 0,
  isr              NUMERIC(10,2) DEFAULT 0,
  otros_descuentos NUMERIC(10,2) DEFAULT 0,
  liquido          NUMERIC(10,2) DEFAULT 0,
  estado           TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','pagada')),
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empleado_id, periodo)
);

-- ─── ÍNDICES DE PERFORMANCE ──────────────────────────────────
CREATE INDEX idx_tenant_users_tenant  ON public.tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_auth    ON public.tenant_users(auth_user_id);
CREATE INDEX idx_clientes_tenant      ON public.clientes(tenant_id);
CREATE INDEX idx_vehiculos_tenant     ON public.vehiculos(tenant_id);
CREATE INDEX idx_vehiculos_cliente    ON public.vehiculos(cliente_id);
CREATE INDEX idx_empleados_tenant     ON public.empleados(tenant_id);
CREATE INDEX idx_ordenes_tenant       ON public.ordenes(tenant_id);
CREATE INDEX idx_ordenes_estado       ON public.ordenes(estado);
CREATE INDEX idx_ordenes_fecha        ON public.ordenes(fecha_ingreso DESC);
CREATE INDEX idx_ordenes_vehiculo     ON public.ordenes(vehiculo_id);
CREATE INDEX idx_ordenes_cliente      ON public.ordenes(cliente_id);
CREATE INDEX idx_inventario_tenant    ON public.inventario(tenant_id);
CREATE INDEX idx_inventario_stock     ON public.inventario(stock);
CREATE INDEX idx_citas_fecha          ON public.citas(fecha);
CREATE INDEX idx_facturas_tenant      ON public.facturas(tenant_id);
CREATE INDEX idx_asistencia_empleado  ON public.asistencia(empleado_id);
CREATE INDEX idx_nomina_empleado      ON public.nomina(empleado_id);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE public.tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empleados        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_servicios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventario       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_repuestos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inv_movimientos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facturas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asistencia       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina           ENABLE ROW LEVEL SECURITY;

-- Políticas abiertas (se restringen con Auth en producción)
CREATE POLICY "allow_all_tenants"         ON public.tenants         FOR ALL USING (true);
CREATE POLICY "allow_all_tenant_users"    ON public.tenant_users    FOR ALL USING (true);
CREATE POLICY "allow_all_clientes"        ON public.clientes        FOR ALL USING (true);
CREATE POLICY "allow_all_vehiculos"       ON public.vehiculos       FOR ALL USING (true);
CREATE POLICY "allow_all_empleados"       ON public.empleados       FOR ALL USING (true);
CREATE POLICY "allow_all_ordenes"         ON public.ordenes         FOR ALL USING (true);
CREATE POLICY "allow_all_ot_servicios"    ON public.ot_servicios    FOR ALL USING (true);
CREATE POLICY "allow_all_inventario"      ON public.inventario      FOR ALL USING (true);
CREATE POLICY "allow_all_ot_repuestos"    ON public.ot_repuestos    FOR ALL USING (true);
CREATE POLICY "allow_all_inv_movimientos" ON public.inv_movimientos FOR ALL USING (true);
CREATE POLICY "allow_all_citas"           ON public.citas           FOR ALL USING (true);
CREATE POLICY "allow_all_facturas"        ON public.facturas        FOR ALL USING (true);
CREATE POLICY "allow_all_asistencia"      ON public.asistencia      FOR ALL USING (true);
CREATE POLICY "allow_all_nomina"          ON public.nomina          FOR ALL USING (true);

-- ─── TENANT INICIAL ──────────────────────────────────────────
INSERT INTO public.tenants (slug, name, nit, plan, email, tel, address)
VALUES (
  'automotriz-torres',
  'Automotriz Torres & Asociados',
  '1234567-8',
  'pro',
  'info@torres.gt',
  '2456-7890',
  '7a Av. 12-34, Zona 1, Ciudad de Guatemala'
);
