-- ═══════════════════════════════════════════════════════
-- 044 — Cierre de sesión por inactividad (editable por taller)
-- tenants.session_timeout_minutes: minutos sin actividad antes de
-- cerrar sesión automáticamente (default 15, igual a FerreProGT).
-- Configurable desde Configuración > Seguridad de Sesión.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 15;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_session_timeout_minutes_check
  CHECK (session_timeout_minutes BETWEEN 1 AND 480);
