-- ═══════════════════════════════════════════════════════
-- 065 — Auto-suspensión de comercios en DEMO vencidos
--
-- Cuando un comercio en prueba gratis (precio_mensual = 0) pasa su fecha
-- de vencimiento (suscripcion_vence < hoy), se suspende automáticamente
-- (active = false) para que pierda el acceso hasta contratar un plan.
--
-- SOLO afecta demos (precio 0). Los planes PAGADOS (precio > 0) NUNCA se
-- auto-suspenden aquí: su mora se maneja aparte (recordatorios) y la
-- suspensión de un cliente que paga es decisión manual del superadmin.
--
-- Corre diario 10:00 UTC = 04:00 Guatemala (pg_cron, instalado en 029).
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.suspender_trials_vencidos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.tenants
     SET active = false
   WHERE active = true
     AND suscripcion_vence IS NOT NULL
     AND suscripcion_vence < CURRENT_DATE
     AND COALESCE(precio_mensual, 0) = 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.suspender_trials_vencidos() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspender_trials_vencidos() TO service_role;

SELECT cron.schedule(
  'suspender-trials-diario',
  '0 10 * * *',
  $$ SELECT public.suspender_trials_vencidos(); $$
);
