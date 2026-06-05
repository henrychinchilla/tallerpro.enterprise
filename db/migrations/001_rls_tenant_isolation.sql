-- ═══════════════════════════════════════════════════════
-- TallerPro Enterprise — Migración 001
-- Aislamiento multi-tenant real con RLS
--
-- PROBLEMA QUE RESUELVE:
--   El schema original deja políticas "public_access" USING(true),
--   por lo que cualquiera con la anon key (pública) puede leer/escribir
--   TODOS los datos de TODOS los talleres. Esta migración reemplaza
--   esas políticas por aislamiento estricto por tenant.
--
-- EJECUTAR EN: Supabase → SQL Editor → New Query → RUN
-- REQUISITO: confirmación de email DESACTIVADA (Auth → Providers → Email)
--            para que el auto-registro funcione (signUp inicia sesión).
-- Idempotente: se puede correr varias veces sin daño.
-- ═══════════════════════════════════════════════════════

begin;

-- ── 1. FUNCIONES HELPER ────────────────────────────────
-- SECURITY DEFINER → corren con privilegios del dueño y NO disparan
-- RLS, evitando recursión al consultar public.usuarios.

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.usuarios where id = auth.uid()
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           (select rol = 'superadmin' from public.usuarios where id = auth.uid()),
           false
         )
         or coalesce(auth.jwt() ->> 'email', '') = 'henry.chinchilla@gmail.com'
$$;

-- ── 2. POLÍTICAS POR TENANT (tablas estándar con tenant_id) ──
do $$
declare
  t text;
  tablas text[] := array[
    'licencias','config_fiscal','clientes','vehiculos','empleados',
    'ordenes','inventario','inventario_movimientos','proveedores',
    'bancos','banco_movimientos','ingresos','egresos','facturas',
    'pagos_nomina','viaticos','bodegas','combos','promociones','citas'
  ];
begin
  foreach t in array tablas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public_access"    on public.%I', t);
    execute format('drop policy if exists "tenant_isolation" on public.%I', t);
    execute format($f$
      create policy "tenant_isolation" on public.%I
        for all to authenticated
        using      (tenant_id = public.current_tenant_id() or public.is_superadmin())
        with check (tenant_id = public.current_tenant_id() or public.is_superadmin())
    $f$, t);
  end loop;
end $$;

-- ── 3. CASO ESPECIAL: tenants (se identifica por su propio id) ──
alter table public.tenants enable row level security;
drop policy if exists "public_access" on public.tenants;
drop policy if exists "tenant_self"   on public.tenants;
create policy "tenant_self" on public.tenants
  for all to authenticated
  using      (id = public.current_tenant_id() or public.is_superadmin())
  with check (id = public.current_tenant_id() or public.is_superadmin());

-- ── 4. CASO ESPECIAL: usuarios ─────────────────────────
--   USING:   ver el propio perfil, compañeros del mismo tenant, o superadmin
--   CHECK:   no permitir asignarse un tenant ajeno (escritura solo dentro del tenant)
alter table public.usuarios enable row level security;
drop policy if exists "public_access"  on public.usuarios;
drop policy if exists "usuarios_tenant" on public.usuarios;
create policy "usuarios_tenant" on public.usuarios
  for all to authenticated
  using      (id = auth.uid()
              or tenant_id = public.current_tenant_id()
              or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id()
              or public.is_superadmin());

-- ── 5. CASO ESPECIAL: empleado_documentos (sin tenant_id) ──
--   Se aísla a través de la tabla empleados.
alter table public.empleado_documentos enable row level security;
drop policy if exists "public_access"  on public.empleado_documentos;
drop policy if exists "empdoc_tenant"  on public.empleado_documentos;
create policy "empdoc_tenant" on public.empleado_documentos
  for all to authenticated
  using (
    public.is_superadmin()
    or empleado_id in (
      select id from public.empleados where tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_superadmin()
    or empleado_id in (
      select id from public.empleados where tenant_id = public.current_tenant_id()
    )
  );

-- ── 6. AUTO-REGISTRO DE TALLERES (RPC) ─────────────────
--   El cliente hace auth.signUp() y luego llama a este RPC.
--   SECURITY DEFINER crea tenant + licencia + config + usuario admin
--   de forma atómica y los vincula al auth.uid() recién creado.
create or replace function public.registrar_taller(
  p_nombre_taller text,
  p_nit           text,
  p_email         text,
  p_nombre        text
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_slug   text;
  v_tenant public.tenants;
begin
  if v_uid is null then
    raise exception 'No autenticado: inicia sesión antes de registrar el taller';
  end if;

  -- Un usuario que ya pertenece a un taller no puede crear otro
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
end $$;

-- ── 7. PERMISOS DE EJECUCIÓN ───────────────────────────
grant execute on function public.current_tenant_id()                       to authenticated;
grant execute on function public.is_superadmin()                           to authenticated;
grant execute on function public.registrar_taller(text,text,text,text)     to authenticated;

-- anon ya no necesita acceso a las tablas (login y registro pasan por
-- el esquema auth y por el RPC). RLS lo bloquearía igualmente al no
-- tener políticas, pero lo revocamos de forma explícita (defensa en profundidad).
revoke all on all tables in schema public from anon;

commit;

-- ═══════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN (correr aparte, debe dar 0 filas):
--   set role anon;
--   select * from public.clientes limit 1;   -- debe fallar / 0 filas
--   reset role;
-- ═══════════════════════════════════════════════════════
