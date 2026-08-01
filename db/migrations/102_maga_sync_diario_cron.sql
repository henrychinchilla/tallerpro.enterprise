-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 102
-- Sincronización DIARIA de precios del MAGA
--
-- Corre todos los días a las 13:00 UTC (07:00 Guatemala), la misma hora que
-- ya usaba el sync mensual del día 8. No compiten: el mensual arma la serie
-- histórica y el diario alimenta las oportunidades del día.
--
-- Pide `dias: 4` a propósito, no 1: el MAGA deja expuestos los últimos días y
-- el upsert es idempotente, así que si un día falla el cron (o el MAGA no
-- publicó a tiempo) el siguiente lo rellena solo. Bajar 4 archivos chicos
-- cuesta menos que un hueco silencioso en la serie.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

SELECT cron.unschedule('maga-sync-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maga-sync-diario');

SELECT cron.schedule(
  'maga-sync-diario',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/maga-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{"modo":"diario","dias":4}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
