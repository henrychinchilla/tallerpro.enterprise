-- ═══════════════════════════════════════════════════════
-- ROLLBACK de la Migración 001 (RLS por tenant)
-- Restaura el estado original (acceso abierto). ⚠️ Solo para
-- emergencia: vuelve a dejar los datos sin aislamiento.
-- EJECUTAR EN: Supabase → SQL Editor → New Query → RUN
-- ═══════════════════════════════════════════════════════

begin;

-- Reponer políticas abiertas en todas las tablas
do $$
declare
  t text;
  tablas text[] := array[
    'tenants','licencias','config_fiscal','usuarios','clientes','vehiculos',
    'empleados','ordenes','inventario','inventario_movimientos','proveedores',
    'bancos','banco_movimientos','ingresos','egresos','facturas','pagos_nomina',
    'viaticos','empleado_documentos','bodegas','combos','promociones','citas'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists "tenant_isolation" on public.%I', t);
    execute format('drop policy if exists "tenant_self"      on public.%I', t);
    execute format('drop policy if exists "usuarios_tenant"  on public.%I', t);
    execute format('drop policy if exists "empdoc_tenant"    on public.%I', t);
    execute format('drop policy if exists "public_access"    on public.%I', t);
    execute format($f$
      create policy "public_access" on public.%I
        for all to anon, authenticated
        using (true) with check (true)
    $f$, t);
  end loop;
end $$;

-- Restaurar grants a anon
grant all on all tables in schema public to anon;

-- Eliminar funciones añadidas
drop function if exists public.registrar_taller(text,text,text,text);
drop function if exists public.current_tenant_id();
drop function if exists public.is_superadmin();

commit;
