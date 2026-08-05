-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 122
-- Auditoría de seguridad: quitar permisos que nadie debería tener.
--
-- HALLAZGO 1 — TRUNCATE. 45 tablas se lo daban a `anon` (el rol del visitante
-- SIN sesión, cuya llave viaja en el JavaScript del navegador por diseño) y 77
-- a `authenticated`. TRUNCATE **no respeta RLS**: donde un DELETE se topa con
-- la política de aislamiento por tenant, un TRUNCATE vacía la tabla entera, de
-- todos los comercios. Hoy PostgREST no expone TRUNCATE, así que no había
-- explotación directa por la API; pero es un permiso que ninguna ruta de la
-- app usa y que convierte cualquier función futura en un borrado total.
--
-- HALLAZGO 2 — el resto de permisos de `anon`. Las mismas 45 tablas le daban
-- SELECT/INSERT/UPDATE/DELETE. RLS lo estaba conteniendo (se verificó: un
-- usuario real ve 0 filas de otro comercio), pero el permiso sobra: la única
-- lectura sin sesión que la app necesita es la búsqueda de comercio del login,
-- y esa va por buscar_talleres(), que es SECURITY DEFINER y no depende de
-- estos GRANT.
--
-- HALLAZGO 3 — código muerto que hace DDL. create_tenant_schema() e
-- init_tenant_tables() son restos de un diseño abandonado (un esquema por
-- taller) que la app reemplazó por tenant_id + RLS. No se llaman desde ningún
-- lado y ejecutan CREATE SCHEMA/CREATE TABLE con format() sobre un texto que
-- recibe. No eran explotables (no son SECURITY DEFINER, así que corren con los
-- permisos de quien llama y anon no puede crear nada), pero son exactamente la
-- pieza que se vuelve una vulnerabilidad el día que alguien les ponga
-- SECURITY DEFINER "para que funcionen".
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. anon no toca ninguna tabla ni secuencia de public ────────────────
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ── 2. Nadie con sesión puede vaciar una tabla ──────────────────────────
revoke truncate on all tables in schema public from authenticated;
alter default privileges in schema public revoke truncate on tables from authenticated;

-- REFERENCES tampoco: permite crear llaves foráneas hacia tablas ajenas y
-- así inferir su contenido por los errores de integridad.
revoke references on all tables in schema public from authenticated;
alter default privileges in schema public revoke references on tables from authenticated;

-- ── 3. anon solo puede ejecutar la búsqueda de comercio del login ───────
-- (buscar_talleres es SECURITY DEFINER, exige 3+ letras, escapa comodines y
--  devuelve máximo 8 comercios activos: es la que llena el campo del login.)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname <> 'buscar_talleres'
  loop
    execute format('revoke execute on function %s from anon', f.firma);
  end loop;
end $$;

-- ── 4. Fuera el código muerto que hace DDL dinámico ─────────────────────
drop function if exists public.create_tenant_schema(text);
drop function if exists public.init_tenant_tables(text);

-- Y el esquema vacío que dejó ese diseño abandonado. CASCADE a propósito:
-- si tuviera tablas con datos el drop fallaría y habría que revisarlo a mano,
-- así que primero se comprueba que esté vacío.
do $$
declare tablas int;
begin
  if exists (select 1 from pg_namespace where nspname = 'taller_taller_primero') then
    select count(*) into tablas from pg_tables where schemaname = 'taller_taller_primero';
    if tablas = 0 then
      execute 'drop schema taller_taller_primero';
    else
      raise notice 'taller_taller_primero tiene % tablas: se deja para revisión manual', tablas;
    end if;
  end if;
end $$;
