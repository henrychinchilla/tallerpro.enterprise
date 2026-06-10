-- ═══════════════════════════════════════════════════════
-- 035 — Plan 'A la Medida' (negociable)
-- Base del plan Básico/Emprendedor + módulos a elección, cada uno
-- con su precio (MODULOS_PRECIOS en config.js; el panel SA calcula
-- el precio mensual automáticamente al marcar módulos).
-- Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan = ANY (ARRAY['starter','basico','pro','empresarial','enterprise','medida']));
