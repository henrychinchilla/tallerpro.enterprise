-- ═══════════════════════════════════════════════════════
-- 029 — Respaldos automáticos a Storage + recordatorios de cobro
--   • bucket privado 'backups' (solo service role; sin policies públicas)
--   • secreto compartido cron→Edge en Vault + RPC get_cron_secret()
--   • pg_cron + pg_net: respaldo diario 02:00 GT y recordatorios 08:00 GT
-- Las Edge Functions backup-tenants y saas-recordatorios validan el
-- header x-cron-secret contra el Vault (o un JWT de superadmin).
-- ═══════════════════════════════════════════════════════

-- Extensiones de programación y HTTP asíncrono
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Bucket privado para respaldos (sin policies en storage.objects:
-- solo el service role de las Edge Functions lee/escribe)
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Secreto compartido para que pg_cron se autentique ante las Edge Functions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      'aa6f5e61cff2ef27a1a10c56683ac25a7747968509824ab4',
      'cron_secret',
      'Secreto compartido cron -> Edge Functions (backup-tenants, saas-recordatorios)'
    );
  END IF;
END $$;

-- RPC para que las Edge Functions (service role) lean el secreto del Vault
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_cron_secret() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO service_role;

-- Respaldo automático diario de todos los talleres: 08:00 UTC = 02:00 Guatemala
SELECT cron.schedule(
  'backup-tenants-diario',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/backup-tenants',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Recordatorios de suscripción: 14:00 UTC = 08:00 Guatemala
SELECT cron.schedule(
  'saas-recordatorios-diario',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/saas-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
