-- ═══════════════════════════════════════════════════════════════
-- TallerPro Enterprise — Migración 001
-- Aislamiento multi-tenant REAL con RLS (cobertura TOTAL)
--
-- APLICADA EN PRODUCCIÓN: 2026-06-07
--   (Supabase migration `20260607191106_rls_tenant_isolation_full_coverage`)
--
-- PROBLEMA QUE RESUELVE:
--   El schema original dejaba políticas abiertas (public_access /
--   allow_all_* / anon_all con USING(true)), por lo que cualquiera con
--   la anon key (pública) podía leer/escribir TODOS los datos de TODOS
--   los talleres. Esta migración BORRA todas esas políticas y aplica
--   aislamiento estricto por tenant en TODA tabla con tenant_id.
--
-- ⚠️ Es DINÁMICA a propósito: la base de producción tiene ~40 tablas
--   (más de las que listaba schema_v3.sql) y varias tenían políticas
--   abiertas con nombres distintos. El enfoque por catálogo garantiza
--   que ninguna tabla quede expuesta por un nombre de política olvidado.
--
-- EJECUTAR EN: Supabase → SQL Editor → New Query → RUN
-- REQUISITO: confirmación de email DESACTIVADA (Auth → Providers → Email)
--            para que el auto-registro funcione (signUp inicia sesión).
-- Idempotente: se puede correr varias veces sin daño.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. HELPERS (SECURITY DEFINER → no disparan RLS, sin recursión) ──
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $fn$
  select tenant_id from public.usuarios where id = auth.uid()
$fn$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((select rol = 'superadmin' from public.usuarios where id = auth.uid()), false)
         or coalesce(auth.jwt() ->> 'email', '') = 'henry.chinchilla@gmail.com'
$fn$;

-- ── 2. BORRAR TODAS LAS POLÍTICAS EXISTENTES EN public ──────────
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ── 3. POLÍTICA tenant_isolation EN TODA TABLA CON tenant_id ─────
--   (excepto usuarios, que tiene política propia abajo)
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
      and c.relname <> 'usuarios'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      )
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format($f$
      create policy "tenant_isolation" on public.%I
        for all to authenticated
        using      (tenant_id = public.current_tenant_id() or public.is_superadmin())
        with check (tenant_id = public.current_tenant_id() or public.is_superadmin())
    $f$, r.relname);
  end loop;
end $$;

-- ── 4. ESPECIAL: tenants (se identifica por su propio id) ───────
alter table public.tenants enable row level security;
create policy "tenant_self" on public.tenants
  for all to authenticated
  using      (id = public.current_tenant_id() or public.is_superadmin())
  with check (id = public.current_tenant_id() or public.is_superadmin());

-- ── 5. ESPECIAL: usuarios (perfil propio + compañeros del tenant) ─
alter table public.usuarios enable row level security;
create policy "usuarios_tenant" on public.usuarios
  for all to authenticated
  using      (id = auth.uid()
              or tenant_id = public.current_tenant_id()
              or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id()
              or public.is_superadmin());

-- ── 6. ESPECIAL: entradas_detalle (sin tenant_id → vía entrada) ──
alter table public.entradas_detalle enable row level security;
create policy "entradas_detalle_tenant" on public.entradas_detalle
  for all to authenticated
  using (
    public.is_superadmin()
    or entrada_id in (select id from public.entradas_inventario
                      where tenant_id = public.current_tenant_id())
  )
  with check (
    public.is_superadmin()
    or entrada_id in (select id from public.entradas_inventario
                      where tenant_id = public.current_tenant_id())
  );

-- ── 7. AUTO-REGISTRO DE TALLERES (RPC SECURITY DEFINER) ─────────
create or replace function public.registrar_taller(
  p_nombre_taller text, p_nit text, p_email text, p_nombre text
)
returns public.tenants language plpgsql security definer set search_path = public as $fn$
declare
  v_uid    uuid := auth.uid();
  v_slug   text;
  v_tenant public.tenants;
begin
  if v_uid is null then
    raise exception 'No autenticado: inicia sesión antes de registrar el taller';
  end if;
  if exists (select 1 from public.usuarios where id = v_uid) then
    raise exception 'Este usuario ya pertenece a un taller';
  end if;

  v_slug := left(regexp_replace(lower(p_nombre_taller), '[^a-z0-9]+', '-', 'g'), 40)
            || '-' || to_char(now(), 'YYYYMMDDHH24MISS');

  insert into public.tenants (slug, name, nit, email)
  values (v_slug, p_nombre_taller, nullif(p_nit, ''), p_email)
  returning * into v_tenant;

  insert into public.licencias (tenant_id, tipo, fecha_inicio, fecha_vencimiento)
  values (v_tenant.id, 'demo', current_date, current_date + 30);

  insert into public.config_fiscal (tenant_id, regimen_iva, tasa_iva, tasa_isr)
  values (v_tenant.id, 'general', 0.12, 0.05);

  insert into public.usuarios (id, tenant_id, nombre, email, rol, activo, avatar)
  values (v_uid, v_tenant.id, p_nombre, p_email, 'admin', true, '👑');

  return v_tenant;
end $fn$;

-- ── 8. PERMISOS ─────────────────────────────────────────────────
grant execute on function public.current_tenant_id()                   to authenticated;
grant execute on function public.is_superadmin()                       to authenticated;
grant execute on function public.registrar_taller(text,text,text,text) to authenticated;

-- anon no necesita acceso a tablas (login/registro van por auth + RPC)
revoke all on all tables in schema public from anon;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICACIÓN (correr aparte; debe dar las tres veces lo esperado):
--   -- A) anon no lee nada:
--   select has_table_privilege('anon','public.clientes','select');  -- false
--
--   -- B) aislamiento cruzado (usuario de otro tenant ve 0):
--   begin;
--     select set_config('request.jwt.claims',
--       '{"sub":"<uuid-usuario>","role":"authenticated","email":"x"}', true);
--     set local role authenticated;
--     select count(*) from public.clientes;   -- solo su tenant
--   rollback;
-- ═══════════════════════════════════════════════════════════════
