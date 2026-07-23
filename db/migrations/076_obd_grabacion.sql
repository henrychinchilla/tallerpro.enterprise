-- ═══════════════════════════════════════════════════════
-- 076 — Grabación de sesión del monitor en vivo OBD-II
--   {inicio, seg, muestras:[{t, rpm, temp, ...}]} por escaneo.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.diagnosticos_obd
  ADD COLUMN IF NOT EXISTS grabacion jsonb;
