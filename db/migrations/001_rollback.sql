-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK de la Migración 001 (RLS por tenant)
-- Restaura el estado original (ACCESO ABIERTO). ⚠️ SOLO emergencia:
-- vuelve a dejar TODOS los datos sin aislamiento entre talleres.
-- EJECUTAR EN: Supabase → SQL Editor → New Query → RUN
-- ═══════════════════════════════════════════════════════════════

begin;

-- Reabrir TODA tabla de public: borrar políticas estrictas y reponer
-- una política abierta (dinámico, cubre las ~40 tablas reales).
do $$
declare r record;
begin
  -- 1) borrar todas las políticas actuales
  for r in select tablename, policyname from pg_policies where schemaname='public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
  -- 2) reponer public_access abierta en cada tabla
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format($f$
      create policy "public_access" on public.%I
        for all to anon, authenticated
        using (true) with check (true)
    $f$, r.relname);
  end loop;
end $$;

-- Restaurar grants a anon
grant all on all tables in schema public to anon;

-- Eliminar funciones añadidas por 001
drop function if exists public.registrar_taller(text,text,text,text);
drop function if exists public.current_tenant_id();
drop function if exists public.is_superadmin();

commit;
