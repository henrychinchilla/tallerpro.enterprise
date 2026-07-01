-- NexusPro v3.0 — Migración 057
-- Nuevos módulos: Agroservicio y Venta de Granos
-- 2026-06-30

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. AGROSERVICIO_SERVICIOS — Servicios agrícolas: semillas, fertilizantes, etc.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
create table if not exists agroservicio_servicios (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null,
  cliente_id uuid not null,
  num text not null default '',
  tipo_servicio text not null,
  descripcion text,
  cantidad numeric not null,
  unidad text default 'unid.',
  precio_venta numeric not null,
  anticipo numeric,
  saldo numeric,
  fecha_entrega date,
  tipo_inicio text default 'directo',
  estado text default 'solicitado',
  ot_id uuid,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(tenant_id, num),
  foreign key(tenant_id) references tenants(id) on delete cascade,
  foreign key(cliente_id) references clientes(id) on delete restrict,
  foreign key(ot_id) references ordenes_trabajo(id) on delete set null
);
create index if not exists idx_agroservicio_tenant on agroservicio_servicios(tenant_id);
create index if not exists idx_agroservicio_cliente on agroservicio_servicios(cliente_id);
create index if not exists idx_agroservicio_estado on agroservicio_servicios(estado);

-- Auditoría: registrar cambios
create trigger agroservicio_audit after insert or update or delete on agroservicio_servicios
for each row execute function auditoria_log_generica('agroservicio_servicios');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. PAGOS_AGROSERVICIO — Registro de anticipos y pagos
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
create table if not exists pagos_agroservicio (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null,
  agroservicio_id uuid not null,
  monto numeric not null,
  tipo_pago text,
  notas text,
  created_at timestamp default now(),
  foreign key(tenant_id) references tenants(id) on delete cascade,
  foreign key(agroservicio_id) references agroservicio_servicios(id) on delete cascade
);
create index if not exists idx_pagos_agro_tenant on pagos_agroservicio(tenant_id);
create index if not exists idx_pagos_agro_servicio on pagos_agroservicio(agroservicio_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. VENTA_GRANOS — Transacciones de compra/venta de granos
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
create table if not exists venta_granos (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null,
  num text not null default '',
  es_compra boolean default false,
  tipo_grano text not null,
  cliente_id uuid,
  proveedor_id uuid,
  cantidad_kg numeric not null,
  precio_kg numeric not null,
  total numeric not null,
  fecha date not null,
  estado text default 'cotizado',
  notas text,
  factura_id uuid,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  unique(tenant_id, num),
  foreign key(tenant_id) references tenants(id) on delete cascade,
  foreign key(cliente_id) references clientes(id) on delete set null,
  foreign key(proveedor_id) references proveedores(id) on delete set null,
  foreign key(factura_id) references facturas(id) on delete set null
);
create index if not exists idx_venta_granos_tenant on venta_granos(tenant_id);
create index if not exists idx_venta_granos_cliente on venta_granos(cliente_id);
create index if not exists idx_venta_granos_proveedor on venta_granos(proveedor_id);
create index if not exists idx_venta_granos_tipo on venta_granos(tipo_grano);
create index if not exists idx_venta_granos_estado on venta_granos(estado);
create index if not exists idx_venta_granos_fecha on venta_granos(fecha);

-- Auditoría
create trigger venta_granos_audit after insert or update or delete on venta_granos
for each row execute function auditoria_log_generica('venta_granos');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. RLS (Row-Level Security) — Aislamiento multi-tenant
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
alter table agroservicio_servicios enable row level security;
create policy agroservicio_rls on agroservicio_servicios
  using (tenant_id = (select auth.user_id()::uuid));

alter table pagos_agroservicio enable row level security;
create policy pagos_agroservicio_rls on pagos_agroservicio
  using (tenant_id = (select auth.user_id()::uuid));

alter table venta_granos enable row level security;
create policy venta_granos_rls on venta_granos
  using (tenant_id = (select auth.user_id()::uuid));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. GRANTS — Acceso para Supabase
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
grant select, insert, update, delete on agroservicio_servicios to authenticated;
grant select, insert, update, delete on pagos_agroservicio to authenticated;
grant select, insert, update, delete on venta_granos to authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. MODULOS_SOLICITUDES — Sistema de solicitud/cotización de nuevos módulos
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
create table if not exists modulos_solicitudes (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null,
  modulo text not null,
  estado text default 'pendiente',
  precio numeric,
  fecha_solicitud timestamp default now(),
  fecha_respuesta timestamp,
  notas text,
  foreign key(tenant_id) references tenants(id) on delete cascade
);
create index if not exists idx_modulos_solicitudes_tenant on modulos_solicitudes(tenant_id);
create index if not exists idx_modulos_solicitudes_estado on modulos_solicitudes(estado);

alter table modulos_solicitudes enable row level security;
grant select, insert on modulos_solicitudes to authenticated;

commit;
