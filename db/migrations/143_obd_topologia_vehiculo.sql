-- Mapa documental por unidad. No contiene comandos ejecutables de diagnóstico.
create table public.obd_topologias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vehiculo_id uuid not null references public.vehiculos(id) on delete cascade,
  categoria text not null check (categoria in ('liviano','pesado','maquinaria','moto')),
  nodos jsonb not null default '[]' check (jsonb_typeof(nodos) = 'array'),
  conexiones jsonb not null default '[]' check (jsonb_typeof(conexiones) = 'array'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  unique (tenant_id, vehiculo_id)
);
alter table public.obd_topologias enable row level security;
revoke all on public.obd_topologias from anon, authenticated;
grant select, insert, update, delete on public.obd_topologias to authenticated;
create policy obd_topologias_taller on public.obd_topologias for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check ((tenant_id = public.current_tenant_id() or public.is_superadmin())
    and exists (select 1 from public.vehiculos v
      where v.id = vehiculo_id and v.tenant_id = obd_topologias.tenant_id));
comment on table public.obd_topologias is
  'Mapa documental por vehículo: módulos y conexiones con evidencia; jamás autoriza comandos OEM. Revisión para evitar sobrescrituras concurrentes.';
