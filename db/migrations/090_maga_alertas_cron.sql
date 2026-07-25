-- ═══════════════════════════════════════════════════════
-- 090 — Envío mensual de las alertas de ventana (fase 4)
--   Corre el día 8 a las 14:00 UTC, una hora después de maga-sync (13:00),
--   para que las alertas usen la serie ya actualizada de ese mes.
--   La Edge Function maga-alertas acepta { dry_run: true } para probar sin
--   escribirle a ningún comercio.
-- ═══════════════════════════════════════════════════════

SELECT cron.unschedule('maga-alertas-mensual')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maga-alertas-mensual');

SELECT cron.schedule(
  'maga-alertas-mensual',
  '0 14 8 * *',
  $$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/maga-alertas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
