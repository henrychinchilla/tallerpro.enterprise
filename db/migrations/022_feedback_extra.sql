-- ═══════════════════════════════════════════════════════
-- 022 — Feedback: datos extra del registro (vehículo y servicio)
--   La encuesta ahora pide más información antes de calificar.
-- Aplicada vía MCP el 2026-06-09.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS vehiculo text,
  ADD COLUMN IF NOT EXISTS servicio text;
