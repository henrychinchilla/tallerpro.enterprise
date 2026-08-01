-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 107
-- Sincronización diaria de precios de menudeo
--
-- 13:20 UTC (07:20 GT): después del sync del MAGA (13:00) y antes del correo
-- de oportunidades (13:40), para que el resumen ya pueda comparar las dos
-- puntas el mismo día.
--
-- Una sola pasada al día y ~20 consultas en total (2 cadenas x 10 términos).
-- Es menos carga que un cliente navegando el sitio; si alguna cadena pidiera
-- no ser consultada, se quita de FUENTES en la Edge Function.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

SELECT cron.unschedule('mercado-sync-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mercado-sync-diario');

SELECT cron.schedule(
  'mercado-sync-diario',
  '20 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/mercado-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
