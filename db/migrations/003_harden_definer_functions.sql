-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 003
-- Endurecer funciones SECURITY DEFINER (atacante secundario)
--
-- APLICADA EN PRODUCCIÓN: 2026-06-07
--   (Supabase migration `20260607191426_harden_security_definer_functions`)
--
-- PROBLEMA QUE RESUELVE:
--   El linter de Supabase detectó funciones SECURITY DEFINER legacy
--   ejecutables por `anon` vía /rest/v1/rpc/* — un anónimo podía crear
--   talleres (crear_taller, onboard_tenant) o sondear licencias
--   (verificar_licencia). Esta migración quita la exposición REST a
--   anon/public en TODAS las funciones definer y reotorga solo las
--   tres que la app necesita para usuarios autenticados.
--
--   `handle_new_user` sigue funcionando como trigger de auth.users:
--   los triggers se ejecutan como el dueño y NO dependen de EXECUTE.
--
-- EJECUTAR EN: Supabase → SQL Editor → New Query → RUN
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prosecdef
  loop
    execute format('revoke all on function %s from anon', f.sig);
    execute format('revoke all on function %s from public', f.sig);
  end loop;
end $$;

-- Únicas SECURITY DEFINER que la app expone a usuarios logueados:
grant execute on function public.current_tenant_id()                   to authenticated;
grant execute on function public.is_superadmin()                       to authenticated;
grant execute on function public.registrar_taller(text,text,text,text) to authenticated;
