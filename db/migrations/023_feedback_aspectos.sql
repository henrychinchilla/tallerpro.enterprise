-- ═══════════════════════════════════════════════════════
-- 023 — Encuesta: aspectos a calificar
--   Instalaciones, limpieza del personal, condiciones de entrega y
--   documentos entregados (además de servicio).
-- Aplicada vía MCP el 2026-06-09.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS rating_instalaciones integer,
  ADD COLUMN IF NOT EXISTS rating_limpieza integer,
  ADD COLUMN IF NOT EXISTS rating_entrega integer,
  ADD COLUMN IF NOT EXISTS rating_documentos integer;
