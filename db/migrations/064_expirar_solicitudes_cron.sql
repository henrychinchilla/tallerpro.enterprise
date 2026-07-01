-- ═══════════════════════════════════════════════════════
-- 064 — Expirar solicitudes de comercio sin verificar (cron)
--
-- Marca 'expirado' las solicitudes que llevan >48h en
-- 'pendiente_verificacion' (nunca verificaron su correo). Así:
--   • dejan de contar en el límite de 3 intentos por correo
--   • no se acumulan solicitudes basura en el panel
-- El usuario auth huérfano se reclama en el próximo intento del mismo
-- correo (registrar-taller), así que no se bloquea un nuevo registro.
--
-- Corre diario 09:00 UTC = 03:00 Guatemala (pg_cron, ya instalado en 029).
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expirar_solicitudes_comercio()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.solicitudes_comercio
     SET estado = 'expirado'
   WHERE estado = 'pendiente_verificacion'
     AND COALESCE(token_expira, created_at + interval '48 hours') < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.expirar_solicitudes_comercio() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_solicitudes_comercio() TO service_role;

SELECT cron.schedule(
  'expirar-solicitudes-diario',
  '0 9 * * *',
  $$ SELECT public.expirar_solicitudes_comercio(); $$
);
