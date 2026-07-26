-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 091
-- Verticales especializados: cierre de brechas OT/anticipo.
--
-- 1) agroservicio_servicios no tenía orden_id ni forma_pago_anticipo,
--    por lo que el módulo NUNCA pudo vincular una OT (el JS llamaba a
--    _especialOT.crearOT(), función inexistente, y el botón "🔧 OT"
--    invocaba _accionGenerarOT(), tampoco definido).
-- 2) Los 4 módulos de 045 (herrería, peletería, electrónica,
--    refrigeración) YA tienen tipo_inicio/orden_id/forma_pago_anticipo
--    aplicados directo en la BD, pero ninguna migración del repo los
--    declaraba (drift). Se agregan idempotentes para que repo == BD.
-- 3) anticipo pasa a ser acumulado (varios abonos), no un único pago:
--    se registra el histórico en pagos_anticipo_vertical.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1) Columnas de vínculo OT + forma de pago en los 5 verticales ──
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'herreria_proyectos','peleteria_pedidos','reparaciones_electronicas',
    'refrigeracion_servicios','agroservicio_servicios'
  ])
  loop
    execute format('alter table public.%I add column if not exists tipo_inicio text default ''directo''', t);
    execute format('alter table public.%I add column if not exists orden_id uuid references public.ordenes(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists forma_pago_anticipo text', t);
    execute format('create index if not exists idx_%s_orden on public.%I(orden_id)', t, t);
  end loop;
end $$;

-- ── 2) Histórico de abonos de los verticales ──────────────────────
-- Antes sólo existía el campo escalar `anticipo`, que el helper
-- sobrescribía en cada abono: el segundo pago borraba el primero.
create table if not exists public.pagos_anticipo_vertical (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  tabla_origen text not null
               check (tabla_origen = any (array['herreria_proyectos','peleteria_pedidos',
                      'reparaciones_electronicas','refrigeracion_servicios','agroservicio_servicios'])),
  registro_id  uuid not null,
  monto        numeric not null check (monto > 0),
  forma_pago   text default 'efectivo',
  notas        text,
  created_at   timestamptz default now()
);
create index if not exists idx_pagos_ant_vert_tenant on public.pagos_anticipo_vertical(tenant_id);
create index if not exists idx_pagos_ant_vert_reg on public.pagos_anticipo_vertical(tabla_origen, registro_id);

alter table public.pagos_anticipo_vertical enable row level security;
drop policy if exists tenant_isolation on public.pagos_anticipo_vertical;
create policy tenant_isolation on public.pagos_anticipo_vertical
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
grant all on public.pagos_anticipo_vertical to authenticated;
revoke all on public.pagos_anticipo_vertical from anon;
drop trigger if exists trg_audit on public.pagos_anticipo_vertical;
create trigger trg_audit after insert or update or delete on public.pagos_anticipo_vertical
  for each row execute function public.fn_audit();

-- ── 3) Correlativo `num` sin condición de carrera ─────────────────
-- El JS lo generaba con count(*)+1: dos usuarios simultáneos obtenían
-- el mismo número, y borrar un registro lo hacía repetirse.
create table if not exists public.correlativos (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  clave     text not null,
  anio      integer not null,
  ultimo    integer not null default 0,
  primary key (tenant_id, clave, anio)
);
alter table public.correlativos enable row level security;
drop policy if exists tenant_isolation on public.correlativos;
create policy tenant_isolation on public.correlativos
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
grant all on public.correlativos to authenticated;
revoke all on public.correlativos from anon;

-- Reserva atómica del siguiente correlativo. El UPDATE toma lock de fila,
-- así que dos sesiones concurrentes se serializan y nunca repiten número.
create or replace function public.siguiente_correlativo(p_clave text, p_prefijo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_anio   integer := extract(year from now())::integer;
  v_num    integer;
begin
  if v_tenant is null then
    raise exception 'sin tenant activo';
  end if;

  insert into public.correlativos (tenant_id, clave, anio, ultimo)
  values (v_tenant, p_clave, v_anio, 1)
  on conflict (tenant_id, clave, anio)
  do update set ultimo = public.correlativos.ultimo + 1
  returning ultimo into v_num;

  return p_prefijo || '-' || v_anio || '-' || lpad(v_num::text, 4, '0');
end $$;

revoke all on function public.siguiente_correlativo(text, text) from public, anon;
grant execute on function public.siguiente_correlativo(text, text) to authenticated;

-- Siembra el contador con lo que ya exista, para no reiniciar en 1
-- en tenants que ya tienen registros.
do $$
declare
  r record;
  m record;
begin
  for m in select * from (values
      ('herreria_proyectos','HER'), ('peleteria_pedidos','PEL'),
      ('reparaciones_electronicas','REP'), ('refrigeracion_servicios','REF'),
      ('agroservicio_servicios','AGRO'), ('ordenes','OT'), ('cotizaciones','COT')
    ) as t(tabla, prefijo)
  loop
    for r in execute format(
      'select tenant_id, count(*)::int as n from public.%I group by tenant_id', m.tabla)
    loop
      insert into public.correlativos (tenant_id, clave, anio, ultimo)
      values (r.tenant_id, m.prefijo, extract(year from now())::integer, r.n)
      on conflict (tenant_id, clave, anio)
      do update set ultimo = greatest(public.correlativos.ultimo, excluded.ultimo);
    end loop;
  end loop;
end $$;
