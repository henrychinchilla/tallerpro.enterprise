-- Catálogo OEM trazable y bitácora de ejecuciones. No guarda firmware ni secretos.
create table if not exists public.obd_oem_definiciones (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  nombre text not null, marca text not null, modelo text, anio_desde int, anio_hasta int,
  ecu text not null, protocolo text not null default 'uds',
  tipo text not null check (tipo in ('did','prueba_activa','calibracion','regeneracion_dpf','purga_abs','codificacion','reflash','security_access','procedimiento')),
  identificador text, definicion jsonb not null default '{}'::jsonb,
  precondiciones jsonb not null default '[]'::jsonb, fuente text not null,
  version_fuente text, estado text not null default 'borrador'
    check (estado in ('borrador','laboratorio','verificado','retirado')),
  riesgo text not null default 'lectura' check (riesgo in ('lectura','controlado','alto','critico')),
  activa boolean not null default true, creado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (anio_desde is null or anio_desde between 1980 and 2200),
  check (anio_hasta is null or anio_hasta between 1980 and 2200),
  check (anio_desde is null or anio_hasta is null or anio_desde <= anio_hasta),
  check (jsonb_typeof(definicion)='object' and jsonb_typeof(precondiciones)='array')
);
create index if not exists obd_oem_def_busqueda_idx on public.obd_oem_definiciones(tenant_id,marca,modelo,anio_desde,anio_hasta);
create unique index if not exists obd_oem_def_clave_idx on public.obd_oem_definiciones
  (tenant_id,marca,coalesce(modelo,''),ecu,tipo,coalesce(identificador,''),coalesce(version_fuente,''));

create table if not exists public.obd_oem_ejecuciones (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
  definicion_id uuid references public.obd_oem_definiciones(id) on delete set null,
  diagnostico_id uuid references public.diagnosticos_obd(id) on delete set null,
  vehiculo_id uuid references public.vehiculos(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  operacion text not null, estado text not null check (estado in ('iniciada','exitosa','rechazada','fallida','cancelada')),
  solicitud_hex text, respuesta_hex text, evidencia jsonb not null default '{}'::jsonb,
  error text, created_at timestamptz not null default now(), check (jsonb_typeof(evidencia)='object')
);
create index if not exists obd_oem_ejec_fecha_idx on public.obd_oem_ejecuciones(tenant_id,created_at desc);
alter table public.obd_oem_definiciones enable row level security;
alter table public.obd_oem_ejecuciones enable row level security;
drop policy if exists obd_oem_def_tenant on public.obd_oem_definiciones;
drop policy if exists obd_oem_def_lectura on public.obd_oem_definiciones;
drop policy if exists obd_oem_def_escritura on public.obd_oem_definiciones;
create policy obd_oem_def_lectura on public.obd_oem_definiciones for select to authenticated
 using (tenant_id=current_tenant_id() or is_superadmin());
create policy obd_oem_def_escritura on public.obd_oem_definiciones for all to authenticated
 using ((tenant_id=current_tenant_id() and exists(select 1 from public.usuarios u where u.id=auth.uid() and u.rol in ('admin','gerente_tal'))) or is_superadmin())
 with check ((tenant_id=current_tenant_id() and exists(select 1 from public.usuarios u where u.id=auth.uid() and u.rol in ('admin','gerente_tal'))) or is_superadmin());
drop policy if exists obd_oem_ejec_tenant on public.obd_oem_ejecuciones;
create policy obd_oem_ejec_tenant on public.obd_oem_ejecuciones for all to authenticated
 using (tenant_id=current_tenant_id() or is_superadmin()) with check (tenant_id=current_tenant_id() or is_superadmin());
revoke all on public.obd_oem_definiciones, public.obd_oem_ejecuciones from anon;
grant select,insert,update,delete on public.obd_oem_definiciones to authenticated;
grant select,insert on public.obd_oem_ejecuciones to authenticated;
