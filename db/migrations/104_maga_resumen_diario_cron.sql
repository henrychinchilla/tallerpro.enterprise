-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 104
-- Envío del resumen diario de oportunidades
--
-- 13:40 UTC (07:40 Guatemala), 40 minutos después del sync diario de las
-- 13:00: le da margen a que el MAGA responda lento sin que el correo salga
-- con los precios de ayer. Si el sync falla, la función no manda nada porque
-- no habrá oportunidades nuevas para la fecha del día.
--
-- Sólo le llega a los comercios con `reporte_maga_diario = true`, al correo
-- que ellos configuren (`email_reporte_maga`, o el del comercio si está
-- vacío). Es el cliente quien decide si lo quiere y a dónde.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

SELECT cron.unschedule('maga-resumen-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maga-resumen-diario');

SELECT cron.schedule(
  'maga-resumen-diario',
  '40 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/maga-alertas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{"modo":"diario"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
