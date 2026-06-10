-- ═══════════════════════════════════════════════════════
-- 038 — Modalidad del entrenamiento (curso en línea, seminario,
-- entrenamiento, taller, certificación). Aplicada vía MCP 2026-06-10.
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.entrenamientos ADD COLUMN IF NOT EXISTS tipo text;
