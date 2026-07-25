-- ═══════════════════════════════════════════════════════
-- 086 — Actualización mensual de los precios MAGA
--   MAGA republica el archivo completo a principios de cada mes y corrige
--   meses anteriores, así que se reimportan los últimos 2 años (no los 28):
--   el upsert pone al día lo corregido sin recargar la historia entera.
--   Mismo patrón que backup-tenants: pg_cron → net.http_post con el secreto
--   compartido de Vault (mig 029).
-- ═══════════════════════════════════════════════════════

SELECT cron.unschedule('maga-sync-mensual')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maga-sync-mensual');

SELECT cron.schedule(
  'maga-sync-mensual',
  '0 13 8 * *',   -- día 8 de cada mes, 13:00 UTC = 07:00 Guatemala
  $$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/maga-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := jsonb_build_object('anio_desde', EXTRACT(YEAR FROM now())::int - 1),
    timeout_milliseconds := 180000
  );
  $$
);

-- Carga inicial (ya ejecutada): la Edge Function se llama por bloques de años
-- porque procesa el archivo completo en cada corrida y así no topa el tiempo
-- máximo de ejecución.
--   body := '{"anio_desde":1990,"anio_hasta":2005}'  → 4,649 precios
--   body := '{"anio_desde":2006,"anio_hasta":2015}'  → 9,297
--   body := '{"anio_desde":2016,"anio_hasta":2023}'  → 16,557
--   body := '{"anio_desde":2024,"anio_hasta":2026}'  → 4,869
-- Total: 35,372 precios / 187 productos / 1998-2026 (10 MB).
