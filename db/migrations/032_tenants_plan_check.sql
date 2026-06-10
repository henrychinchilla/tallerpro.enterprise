-- ═══════════════════════════════════════════════════════
-- 032 — CHECK de tenants.plan acepta los planes comerciales nuevos
-- El constraint original solo permitía starter/pro/enterprise, por lo
-- que el panel SaaS no podía guardar basico/empresarial (23514).
-- Detectado al asignar plan a CM MULTISERVICIOS. Aplicada vía MCP 2026-06-10.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan = ANY (ARRAY['starter','basico','pro','empresarial','enterprise']));
