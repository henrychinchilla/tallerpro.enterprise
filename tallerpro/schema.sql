-- ═══════════════════════════════════════════════════════════════════
-- TallerPro Enterprise — Schema Multi-Tenant (Supabase / PostgreSQL)
-- Versión: 2.0 | Guatemala Compliant: SAT FEL, MINTRAB, IGSS
-- ═══════════════════════════════════════════════════════════════════

-- ─── EXTENSIONES ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── SCHEMA PÚBLICO (PLATAFORMA) ─────────────────────────────────
-- Gestiona tenants y super-admin. Los datos operativos van en schema por tenant.

CREATE TABLE public.tenants (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug            VARCHAR(80) NOT NULL UNIQUE, -- ej: "automotriz-torres"
    name            VARCHAR(200) NOT NULL,
    nit             VARCHAR(20),
    plan            VARCHAR(20) DEFAULT 'starter' CHECK (plan IN ('starter','pro','enterprise')),
    email           VARCHAR(200),
    tel             VARCHAR(30),
    address         TEXT,
    logo_url        TEXT,
    active          BOOLEAN DEFAULT TRUE,
    fel_nit         VARCHAR(20),           -- NIT para FEL SAT
    fel_certificador VARCHAR(50),          -- INFILE, G4S, EDIAG
    whatsapp_token  TEXT,                  -- Twilio API token (cifrado)
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.tenant_users (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    auth_user_id    UUID NOT NULL,          -- Supabase auth.users.id
    nombre          VARCHAR(200) NOT NULL,
    email           VARCHAR(200) NOT NULL,
    rol             VARCHAR(30) NOT NULL CHECK (rol IN ('admin','recepcionista','jefe','mecanico','cliente')),
    cargo           VARCHAR(100),
    tel             VARCHAR(30),
    avatar_url      TEXT,
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, auth_user_id)
);

CREATE INDEX idx_tenant_users_tenant ON public.tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_auth ON public.tenant_users(auth_user_id);

-- ─── FUNCIÓN: CREAR SCHEMA DE TENANT ────────────────────────────
CREATE OR REPLACE FUNCTION public.create_tenant_schema(p_slug TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    schema_name TEXT := 'taller_' || replace(p_slug, '-', '_');
BEGIN
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
    PERFORM public.init_tenant_tables(schema_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.init_tenant_tables(p_schema TEXT)
-- Busca la función init_tenant_tables y asegúrate de que los % estén escapados así:
CREATE OR REPLACE FUNCTION public.init_tenant_tables(p_schema TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    -- ... (resto de tu código anterior)

    -- Ejemplo de la corrección necesaria cerca de la línea 218:
    -- Si usas to_char o cálculos, usa %%
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.reportes_mensuales (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            mes TEXT CHECK (mes ~ ''^[0-9]{4}-(0[1-9]|1[0-2])$''), -- Cambiado para evitar %
            total_ventas NUMERIC DEFAULT 0
        )', p_schema);

    -- Si tienes cálculos de porcentajes en disparadores (triggers), 
    -- asegúrate de que no estén dentro de un format() o usa %%
END;
$$;
BEGIN

    -- ─── CLIENTES ────────────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.clientes (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        nombre          VARCHAR(200) NOT NULL,
        nit             VARCHAR(20),
        dpi             VARCHAR(20),           -- cifrado AES-256 en app
        email           VARCHAR(200),
        tel             VARCHAR(30),
        tel2            VARCHAR(30),
        direccion       TEXT,
        fecha_nacimiento DATE,
        notas           TEXT,
        activo          BOOLEAN DEFAULT TRUE,
        created_by      UUID,
        created_at      TIMESTAMPTZ DEFAULT now(),
        updated_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema);

    -- ─── VEHÍCULOS ───────────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.vehiculos (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        cliente_id      UUID NOT NULL REFERENCES %I.clientes(id),
        placa           VARCHAR(15) NOT NULL,
        vin             VARCHAR(20),
        marca           VARCHAR(60) NOT NULL,
        modelo          VARCHAR(60) NOT NULL,
        anio            SMALLINT,
        color           VARCHAR(40),
        motor           VARCHAR(80),
        transmision     VARCHAR(20),
        combustible     VARCHAR(20) DEFAULT ''gasolina'',
        kilometraje     INTEGER DEFAULT 0,
        ultima_visita   DATE,
        notas           TEXT,
        api_data        JSONB,                -- datos de CarMD / DataOne
        fotos           TEXT[],               -- URLs en Supabase Storage
        created_at      TIMESTAMPTZ DEFAULT now(),
        updated_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema);

    -- ─── EMPLEADOS ───────────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.empleados (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id         UUID,                 -- referencia a tenant_users
        nombre          VARCHAR(200) NOT NULL,
        dpi             TEXT,                 -- cifrado
        nit             VARCHAR(20),
        fecha_ingreso   DATE,
        cargo           VARCHAR(100),
        rol             VARCHAR(30),
        salario_base    NUMERIC(10,2),
        bonificacion    NUMERIC(10,2) DEFAULT 250.00,
        igss            BOOLEAN DEFAULT TRUE,
        banco           VARCHAR(60),
        cuenta_banco    TEXT,                 -- cifrado
        activo          BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema);

    -- ─── ÓRDENES DE TRABAJO ──────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.ordenes (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        num             VARCHAR(20) NOT NULL UNIQUE, -- OT-2025-0001
        vehiculo_id     UUID NOT NULL REFERENCES %I.vehiculos(id),
        cliente_id      UUID NOT NULL REFERENCES %I.clientes(id),
        mecanico_id     UUID REFERENCES %I.empleados(id),
        estado          VARCHAR(30) DEFAULT ''recibido''
                            CHECK (estado IN (''recibido'',''diagnostico'',''en_trabajo'',
                                              ''espera_repuestos'',''listo'',''entregado'',''cancelado'')),
        prioridad       VARCHAR(10) DEFAULT ''media''
                            CHECK (prioridad IN (''baja'',''media'',''alta'',''urgente'')),
        descripcion     TEXT NOT NULL,
        notas           TEXT,
        km_ingreso      INTEGER,
        fecha_ingreso   TIMESTAMPTZ DEFAULT now(),
        fecha_estimada  DATE,
        fecha_entrega   TIMESTAMPTZ,
        total_mano_obra NUMERIC(10,2) DEFAULT 0,
        total_repuestos NUMERIC(10,2) DEFAULT 0,
        descuento       NUMERIC(10,2) DEFAULT 0,
        subtotal        NUMERIC(10,2) GENERATED ALWAYS AS (total_mano_obra + total_repuestos - descuento) STORED,
        iva             NUMERIC(10,2) GENERATED ALWAYS AS (ROUND((total_mano_obra + total_repuestos - descuento) * 0.12, 2)) STORED,
        total           NUMERIC(10,2) GENERATED ALWAYS AS (ROUND((total_mano_obra + total_repuestos - descuento) * 1.12, 2)) STORED,
        fotos           TEXT[],
        created_by      UUID,
        created_at      TIMESTAMPTZ DEFAULT now(),
        updated_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema, p_schema, p_schema);

    -- ─── SERVICIOS DE OT ─────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.ot_servicios (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        ot_id           UUID NOT NULL REFERENCES %I.ordenes(id) ON DELETE CASCADE,
        descripcion     VARCHAR(300) NOT NULL,
        cantidad        NUMERIC(8,2) DEFAULT 1,
        precio_unitario NUMERIC(10,2) NOT NULL,
        subtotal        NUMERIC(10,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
        mecanico_id     UUID,
        completado      BOOLEAN DEFAULT FALSE,
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema);

    -- ─── INVENTARIO ──────────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventario (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        codigo          VARCHAR(30) NOT NULL UNIQUE,
        nombre          VARCHAR(200) NOT NULL,
        descripcion     TEXT,
        categoria       VARCHAR(60),
        marca           VARCHAR(80),
        proveedor       VARCHAR(100),
        ubicacion       VARCHAR(60),
        stock           INTEGER DEFAULT 0,
        min_stock       INTEGER DEFAULT 2,
        max_stock       INTEGER,
        precio_costo    NUMERIC(10,2),
        precio_venta    NUMERIC(10,2),
        cpp             NUMERIC(10,2),         -- Costo Promedio Ponderado
        activo          BOOLEAN DEFAULT TRUE,
        qr_code         TEXT,
        created_at      TIMESTAMPTZ DEFAULT now(),
        updated_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema);

    -- ─── REPUESTOS EN OT ─────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.ot_repuestos (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        ot_id           UUID NOT NULL REFERENCES %I.ordenes(id) ON DELETE CASCADE,
        repuesto_id     UUID NOT NULL REFERENCES %I.inventario(id),
        cantidad        INTEGER NOT NULL,
        precio_unitario NUMERIC(10,2) NOT NULL,
        subtotal        NUMERIC(10,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema, p_schema);

    -- ─── MOVIMIENTOS DE INVENTARIO ───────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inv_movimientos (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        repuesto_id     UUID NOT NULL REFERENCES %I.inventario(id),
        tipo            VARCHAR(20) NOT NULL CHECK (tipo IN (''entrada'',''salida'',''ajuste'',''devolucion'')),
        cantidad        INTEGER NOT NULL,
        precio_unitario NUMERIC(10,2),
        ot_id           UUID,
        referencia      VARCHAR(100),
        notas           TEXT,
        usuario_id      UUID,
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema);

    -- ─── CITAS / CALENDARIO ──────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.citas (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        cliente_id      UUID REFERENCES %I.clientes(id),
        vehiculo_id     UUID REFERENCES %I.vehiculos(id),
        fecha           DATE NOT NULL,
        hora_inicio     TIME NOT NULL,
        hora_fin        TIME,
        servicio        VARCHAR(200),
        notas           TEXT,
        estado          VARCHAR(20) DEFAULT ''pendiente'' CHECK (estado IN (''pendiente'',''confirmada'',''cancelada'',''completada'')),
        ot_id           UUID,
        created_by      UUID,
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema, p_schema);

    -- ─── FACTURAS FEL ────────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.facturas (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        num             VARCHAR(30) NOT NULL UNIQUE,  -- FEL-2025-000001
        ot_id           UUID REFERENCES %I.ordenes(id),
        cliente_id      UUID NOT NULL REFERENCES %I.clientes(id),
        nit             VARCHAR(20) NOT NULL,
        nombre_receptor VARCHAR(200),
        direccion       TEXT,
        fecha           DATE DEFAULT CURRENT_DATE,
        descripcion     TEXT,
        subtotal        NUMERIC(10,2) NOT NULL,
        iva             NUMERIC(10,2) NOT NULL,
        total           NUMERIC(10,2) NOT NULL,
        estado          VARCHAR(20) DEFAULT ''borrador'' CHECK (estado IN (''borrador'',''pendiente'',''certificada'',''anulada'')),
        fel_uuid        VARCHAR(100),            -- UUID asignado por certificador
        fel_serie       VARCHAR(20),
        fel_numero      VARCHAR(20),
        fel_respuesta   JSONB,                   -- respuesta raw del certificador
        pdf_url         TEXT,
        created_by      UUID,
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema, p_schema);

    -- ─── ASISTENCIA ──────────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.asistencia (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        empleado_id     UUID NOT NULL REFERENCES %I.empleados(id),
        fecha           DATE NOT NULL,
        hora_entrada    TIME,
        hora_salida     TIME,
        tipo            VARCHAR(20) DEFAULT ''normal'' CHECK (tipo IN (''normal'',''overtime'',''falta'',''vacacion'',''permiso'')),
        notas           TEXT,
        created_at      TIMESTAMPTZ DEFAULT now(),
        UNIQUE(empleado_id, fecha)
    )', p_schema, p_schema);

    -- ─── NÓMINA ──────────────────────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.nomina (
        id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        empleado_id     UUID NOT NULL REFERENCES %I.empleados(id),
        periodo         VARCHAR(10) NOT NULL, -- YYYY-MM
        dias_trabajados INTEGER,
        salario_base    NUMERIC(10,2),
        bonificacion    NUMERIC(10,2),
        otros_ingresos  NUMERIC(10,2) DEFAULT 0,
        igss_laboral    NUMERIC(10,2),   -- 4.83%
        igss_patronal   NUMERIC(10,2),   -- 12.67%
        isr             NUMERIC(10,2) DEFAULT 0,
        otros_descuentos NUMERIC(10,2) DEFAULT 0,
        liquido         NUMERIC(10,2),
        estado          VARCHAR(20) DEFAULT ''pendiente'' CHECK (estado IN (''pendiente'',''aprobada'',''pagada'')),
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema, p_schema);

    -- ─── AUDIT LOG (APPEND-ONLY) ──────────────────────────────────
    EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.auditoria_log (
        id              BIGSERIAL PRIMARY KEY,
        tabla           VARCHAR(60) NOT NULL,
        registro_id     UUID,
        accion          VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE, LOGIN, LOGOUT
        datos_antes     JSONB,
        datos_despues   JSONB,
        usuario_id      UUID,
        usuario_email   VARCHAR(200),
        ip_origen       INET,
        user_agent      TEXT,
        created_at      TIMESTAMPTZ DEFAULT now()
    )', p_schema);

    -- REVOCAR DELETE/UPDATE en audit log
    EXECUTE format('REVOKE DELETE, UPDATE, TRUNCATE ON %I.auditoria_log FROM PUBLIC', p_schema);

    -- ─── ÍNDICES DE PERFORMANCE ──────────────────────────────────
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ordenes_vehiculo ON %I.ordenes(vehiculo_id)', p_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON %I.ordenes(cliente_id)', p_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON %I.ordenes(estado)', p_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON %I.ordenes(fecha_ingreso DESC)', p_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_inv_stock ON %I.inventario(stock) WHERE stock <= min_stock', p_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_citas_fecha ON %I.citas(fecha)', p_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_facturas_estado ON %I.facturas(estado)', p_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_audit_tabla ON %I.auditoria_log(tabla, created_at DESC)', p_schema);

END;
$$;

-- ─── TRIGGER: AUTO-UPDATE updated_at ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ─── FUNCIÓN: CALCULAR NÓMINA ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcular_nomina(
    p_schema TEXT, p_empleado_id UUID, p_periodo TEXT
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_emp RECORD;
    v_dias INTEGER;
    v_igss_lab NUMERIC;
    v_igss_pat NUMERIC;
    v_liquido NUMERIC;
BEGIN
    EXECUTE format('SELECT * FROM %I.empleados WHERE id = $1', p_schema)
        INTO v_emp USING p_empleado_id;

    EXECUTE format('
        SELECT COUNT(*) FROM %I.asistencia
        WHERE empleado_id = $1 AND to_char(fecha, ''YYYY-MM'') = $2
        AND tipo IN (''normal'',''overtime'')', p_schema)
        INTO v_dias USING p_empleado_id, p_periodo;

    v_igss_lab  := ROUND(v_emp.salario_base * 0.0483, 2);
    v_igss_pat  := ROUND(v_emp.salario_base * 0.1267, 2);
    v_liquido   := v_emp.salario_base + v_emp.bonificacion - v_igss_lab;

    RETURN jsonb_build_object(
        'empleado_id', p_empleado_id,
        'periodo', p_periodo,
        'salario_base', v_emp.salario_base,
        'bonificacion', v_emp.bonificacion,
        'dias_trabajados', v_dias,
        'igss_laboral', v_igss_lab,
        'igss_patronal', v_igss_pat,
        'liquido', v_liquido
    );
END;
$$;

-- ─── FUNCIÓN: ONBOARDING DE NUEVO TALLER ─────────────────────────
CREATE OR REPLACE FUNCTION public.onboard_tenant(
    p_name TEXT, p_slug TEXT, p_email TEXT, p_nit TEXT, p_plan TEXT DEFAULT 'starter'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    INSERT INTO public.tenants(name, slug, email, nit, plan)
    VALUES(p_name, p_slug, p_email, p_nit, p_plan)
    RETURNING id INTO v_tenant_id;

    PERFORM public.create_tenant_schema(p_slug);

    -- Log de auditoría global
    INSERT INTO public.tenants(id) VALUES (v_tenant_id) ON CONFLICT DO NOTHING;

    RETURN v_tenant_id;
END;
$$;

-- ─── COMENTARIOS ─────────────────────────────────────────────────
COMMENT ON TABLE public.tenants IS 'Talleres registrados en la plataforma TallerPro';
COMMENT ON TABLE public.tenant_users IS 'Usuarios por taller con rol RBAC';
COMMENT ON FUNCTION public.create_tenant_schema IS 'Crea schema PostgreSQL aislado para nuevo taller';
COMMENT ON FUNCTION public.calcular_nomina IS 'Calcula nómina mensual con descuentos IGSS/MINTRAB Guatemala';

-- ─── EJEMPLO DE USO ──────────────────────────────────────────────
-- SELECT public.onboard_tenant('Automotriz Torres', 'automotriz-torres', 'admin@torres.gt', '1234567-8', 'pro');
-- SET search_path = taller_automotriz_torres;
-- SELECT * FROM clientes;
