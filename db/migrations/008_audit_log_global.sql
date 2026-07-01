-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 008
-- Bitácora de auditoría GLOBAL (todas las acciones de la app)
--
-- APLICADA EN PRODUCCIÓN: 2026-06-07 (audit_log_global) — 39 triggers
--
-- Registra insert/update/delete de TODA tabla con id + tenant_id mediante
-- un trigger genérico SECURITY DEFINER. El log es de solo lectura para los
-- usuarios (a prueba de manipulación): solo el trigger inserta.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.actividad_log (
  id             uuid default gen_random_uuid() primary key,
  tenant_id      uuid references public.tenants(id) on delete cascade,
  usuario_id     uuid,
  usuario_nombre text,
  modulo         text,
  accion         text,      -- insert | update | delete
  entidad        text,      -- tabla afectada
  entidad_id     text,
  detalle        text,
  created_at     timestamptz default now()
);
create index if not exists idx_actividad_tenant_fecha on public.actividad_log(tenant_id, created_at desc);

alter table public.actividad_log enable row level security;
drop policy if exists "log_select" on public.actividad_log;
create policy "log_select" on public.actividad_log
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_superadmin());
grant select on public.actividad_log to authenticated;
revoke all on public.actividad_log from anon;

create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_id text;
  v_tenant uuid;
begin
  v_row := to_jsonb(case when TG_OP = 'DELETE' then OLD else NEW end);
  v_id := v_row->>'id';
  begin v_tenant := (v_row->>'tenant_id')::uuid; exception when others then v_tenant := null; end;
  insert into public.actividad_log(tenant_id, usuario_id, usuario_nombre, modulo, accion, entidad, entidad_id)
  values (v_tenant, v_uid, (select nombre from public.usuarios where id = v_uid),
          TG_TABLE_NAME, lower(TG_OP), TG_TABLE_NAME, v_id);
  return null;
end $fn$;

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
      and c.relname not in ('actividad_log','ai_conversaciones','mensajes')
      and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and not a.attisdropped)
  loop
    execute format('drop trigger if exists trg_audit on public.%I', r.relname);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()', r.relname);
  end loop;
end $$;

alter table public.inventario_movimientos add column if not exists usuario_id uuid;
alter table public.inventario_movimientos add column if not exists usuario_nombre text;
