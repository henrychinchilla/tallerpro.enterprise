-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 123
-- Cierra los dos cabos que dejó la 122.
--
-- 1) El REVOKE ... FROM anon de la 122 no bajó ocho funciones porque el
--    permiso no era de anon: era de PUBLIC (`=X/postgres` en proacl), que es
--    el default de Postgres al crear una función. Revocar a anon no quita lo
--    que se concedió a PUBLIC.
--
--    Las ocho son cuerpos de TRIGGER (fn_sync_*, validar_*, auto_enroll_cliente,
--    contiene_posible_pan, fn_guard_mfa_pausa). Un trigger ejecuta su función
--    sin mirar el permiso EXECUTE del usuario, así que quitarlo no rompe nada
--    y sí quita superficie: hoy cualquiera con la anon key podía invocarlas
--    por RPC. contiene_posible_pan y validar_sin_pan_* son justamente las que
--    detectan números de tarjeta — dejarlas llamables permitía usarlas como
--    oráculo para probar si un número pasa el filtro.
--
--    buscar_talleres NO se toca: es la búsqueda de comercio del login y su
--    permiso a anon es explícito y deliberado.
--
-- 2) El esquema taller_taller_primero, resto del diseño abandonado de "un
--    esquema por taller". La 122 lo dejó por tener tablas; se verificó que sus
--    4 tablas (clientes, vehiculos, ordenes, asistencia) están VACÍAS y que ni
--    anon ni authenticated tienen permisos sobre ellas. Se elimina.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'buscar_talleres'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end $$;

-- Las funciones nuevas tampoco nacen ejecutables por cualquiera.
alter default privileges in schema public revoke execute on functions from public, anon;

-- Solo si sigue vacío: si alguien le metió datos entre la 122 y ahora, se deja
-- y se avisa, en vez de borrar información sin mirar.
do $$
declare filas bigint := 0; t record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'taller_taller_primero') then
    return;
  end if;
  for t in select tablename from pg_tables where schemaname = 'taller_taller_primero' loop
    execute format('select count(*) from taller_taller_primero.%I', t.tablename) into strict filas;
    if filas > 0 then
      raise notice 'taller_taller_primero.% tiene % filas: NO se elimina el esquema', t.tablename, filas;
      return;
    end if;
  end loop;
  execute 'drop schema taller_taller_primero cascade';
end $$;
