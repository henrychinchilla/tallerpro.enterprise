-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 045
-- Módulos verticales activables a la carta desde el Panel SaaS:
--   1) Cotización de Servicios (universal, cualquier vertical)
--   2) Herrería Industrial y Ventanería PVC/Aluminio
--   3) Peletería
--   4) Reparaciones Electrónicas
--   5) Reparación de Refrigeración y A/C (vehicular/domiciliar/industrial)
--
-- Cada tabla sigue el patrón estándar del proyecto: tenant_id +
-- RLS tenant_isolation + trigger de auditoría (fn_audit, migración 008).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) COTIZACIÓN DE SERVICIOS ─────────────────────────────────
create table if not exists public.cotizaciones (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  num                text,
  cliente_id         uuid references public.clientes(id) on delete set null,
  vehiculo_id        uuid references public.vehiculos(id) on delete set null,
  modulo_origen      text default 'general'
                     check (modulo_origen = any (array['general','taller','herreria','peleteria','electronica','refrigeracion'])),
  fecha              date default current_date,
  validez_dias       integer default 8,
  subtotal           numeric default 0,
  descuento_pct      numeric default 0,
  descuento_monto    numeric default 0,
  iva                numeric default 0,
  total              numeric default 0,
  estado             text default 'pendiente'
                     check (estado = any (array['pendiente','aprobada','rechazada','vencida','convertida'])),
  convertida_orden_id uuid references public.ordenes(id) on delete set null,
  notas              text,
  condiciones        text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists idx_cotizaciones_tenant on public.cotizaciones(tenant_id);
create index if not exists idx_cotizaciones_cliente on public.cotizaciones(cliente_id);

create table if not exists public.cotizacion_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  descripcion   text not null,
  cantidad      numeric default 1,
  precio_unit   numeric default 0,
  descuento_pct numeric default 0,
  total         numeric default 0,
  created_at    timestamptz default now()
);
create index if not exists idx_cotizacion_items_cot on public.cotizacion_items(cotizacion_id);

-- ── 2) HERRERÍA INDUSTRIAL Y VENTANERÍA PVC/ALUMINIO ───────────
create table if not exists public.herreria_proyectos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  num                   text,
  cliente_id            uuid references public.clientes(id) on delete set null,
  tipo_trabajo          text default 'otro'
                        check (tipo_trabajo = any (array['porton','baranda','escalera','estructura_metalica','techo_metalico','ventana_pvc','puerta_pvc','ventana_aluminio','puerta_aluminio','cancel','otro'])),
  descripcion           text,
  ancho_m               numeric,
  alto_m                numeric,
  cantidad              numeric default 1,
  area_m2               numeric,
  material              text,
  color                 text,
  ubicacion_instalacion text,
  direccion_instalacion text,
  responsable_id        uuid references public.empleados(id) on delete set null,
  estado                text default 'cotizado'
                        check (estado = any (array['cotizado','aprobado','en_fabricacion','en_instalacion','entregado','cancelado','garantia'])),
  fecha_compromiso      date,
  costo_materiales      numeric default 0,
  costo_mano_obra       numeric default 0,
  precio_venta          numeric default 0,
  anticipo              numeric default 0,
  saldo                 numeric default 0,
  notas                 text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create index if not exists idx_herreria_tenant on public.herreria_proyectos(tenant_id);
create index if not exists idx_herreria_cliente on public.herreria_proyectos(cliente_id);

-- ── 3) PELETERÍA ────────────────────────────────────────────────
create table if not exists public.peleteria_pedidos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  num             text,
  cliente_id      uuid references public.clientes(id) on delete set null,
  tipo_producto   text default 'otro'
                  check (tipo_producto = any (array['cinturon','bolso','cartera','billetera','calzado','talabarteria','mochila','funda','otro'])),
  material        text,
  color           text,
  medidas         text,
  cantidad        numeric default 1,
  descripcion     text,
  responsable_id  uuid references public.empleados(id) on delete set null,
  estado          text default 'pedido'
                  check (estado = any (array['pedido','en_proceso','control_calidad','terminado','entregado','cancelado'])),
  fecha_pedido    date default current_date,
  fecha_entrega   date,
  costo_material  numeric default 0,
  costo_mano_obra numeric default 0,
  precio_venta    numeric default 0,
  anticipo        numeric default 0,
  saldo           numeric default 0,
  notas           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_peleteria_tenant on public.peleteria_pedidos(tenant_id);
create index if not exists idx_peleteria_cliente on public.peleteria_pedidos(cliente_id);

-- ── 4) REPARACIONES ELECTRÓNICAS ───────────────────────────────
create table if not exists public.reparaciones_electronicas (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  num                   text,
  cliente_id            uuid references public.clientes(id) on delete set null,
  tipo_equipo           text default 'otro'
                        check (tipo_equipo = any (array['celular','tablet','laptop','computadora','tv','consola','audio','electrodomestico','otro'])),
  marca                 text,
  modelo                text,
  numero_serie          text,
  accesorios_recibidos  text,
  falla_reportada       text not null,
  diagnostico           text,
  trabajo_realizado     text,
  tecnico_id            uuid references public.empleados(id) on delete set null,
  estado                text default 'recibido'
                        check (estado = any (array['recibido','diagnostico','esperando_aprobacion','en_reparacion','listo','entregado','sin_reparacion','garantia'])),
  costo_diagnostico     numeric default 0,
  costo_repuestos       numeric default 0,
  costo_mano_obra       numeric default 0,
  precio_total          numeric default 0,
  anticipo              numeric default 0,
  saldo                 numeric default 0,
  garantia_dias         integer default 30,
  fecha_recibido        date default current_date,
  fecha_entrega         date,
  notas                 text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);
create index if not exists idx_reparelec_tenant on public.reparaciones_electronicas(tenant_id);
create index if not exists idx_reparelec_cliente on public.reparaciones_electronicas(cliente_id);

-- ── 5) REPARACIÓN DE REFRIGERACIÓN Y A/C ───────────────────────
create table if not exists public.refrigeracion_servicios (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  num                text,
  cliente_id         uuid references public.clientes(id) on delete set null,
  vehiculo_id        uuid references public.vehiculos(id) on delete set null,
  tipo_sistema       text default 'otro'
                     check (tipo_sistema = any (array['ac_vehicular','ac_domiciliar','ac_industrial','refrigeracion_comercial','camara_fria','congelador','otro'])),
  tipo_servicio      text default 'reparacion'
                     check (tipo_servicio = any (array['mantenimiento','instalacion','reparacion','carga_gas','diagnostico','limpieza'])),
  marca_equipo       text,
  modelo_equipo      text,
  tipo_gas           text,
  cantidad_gas_lb    numeric,
  presion_alta       numeric,
  presion_baja       numeric,
  falla_reportada    text,
  diagnostico        text,
  trabajo_realizado  text,
  tecnico_id         uuid references public.empleados(id) on delete set null,
  direccion_servicio text,
  estado             text default 'pendiente'
                     check (estado = any (array['pendiente','en_proceso','completado','garantia','cancelado'])),
  costo_servicio     numeric default 0,
  costo_repuestos    numeric default 0,
  costo_gas          numeric default 0,
  precio_total       numeric default 0,
  anticipo           numeric default 0,
  saldo              numeric default 0,
  fecha_servicio     date default current_date,
  proxima_revision   date,
  garantia_dias      integer default 30,
  notas              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists idx_refrigeracion_tenant on public.refrigeracion_servicios(tenant_id);
create index if not exists idx_refrigeracion_cliente on public.refrigeracion_servicios(cliente_id);

-- ── RLS: misma política tenant_isolation en las 6 tablas ───────
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'cotizaciones','cotizacion_items','herreria_proyectos',
    'peleteria_pedidos','reparaciones_electronicas','refrigeracion_servicios'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated using (tenant_id = public.current_tenant_id() or public.is_superadmin()) with check (tenant_id = public.current_tenant_id() or public.is_superadmin())',
      t
    );
    execute format('grant all on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()', t);
  end loop;
end $$;
