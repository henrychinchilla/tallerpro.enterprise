-- ═══════════════════════════════════════════════════════
-- 021 — Agregar columna igss_patronal a tenants
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS igss_patronal TEXT;

-- Forzar recarga de PostgREST
NOTIFY pgrst, 'reload schema';
