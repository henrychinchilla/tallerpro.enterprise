-- ═══════════════════════════════════════════════════════
-- 033 — Beto IA por suscripción + trial unificado
--   • tenants.ai_limite_mes: tope mensual de consultas IA
--     (default 300, ampliable por taller desde el panel SA)
--   • registrar_taller: el auto-registro YA NO crea licencia demo;
--     crea el tenant con prueba de 30 días del plan Empresarial
--     (suscripcion_vence = hoy+30, precio 0). La licencia vieja
--     queda retirada del flujo (la tabla licencias se conserva
--     solo por compatibilidad con backups antiguos).
-- Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS ai_limite_mes integer DEFAULT 300;

CREATE OR REPLACE FUNCTION public.registrar_taller(p_nombre_taller text, p_nit text, p_email text, p_nombre text)
 RETURNS tenants
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  insert into public.tenants (slug, name, nit, email, plan, precio_mensual,
                              suscripcion_vence, ciclo_pago, notas_admin)
  values (v_slug, p_nombre_taller, nullif(p_nit, ''), p_email, 'empresarial', 0,
          current_date + 30, 'mensual', 'Prueba gratis 30 días (auto-registro)')
  returning * into v_tenant;

  insert into public.config_fiscal (tenant_id, regimen_iva, tasa_iva, tasa_isr)
  values (v_tenant.id, 'general', 0.12, 0.05);

  insert into public.usuarios (id, tenant_id, nombre, email, rol, activo, avatar)
  values (v_uid, v_tenant.id, p_nombre, p_email, 'admin', true, '👑');

  return v_tenant;
end $function$;
