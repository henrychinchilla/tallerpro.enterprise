-- ═══════════════════════════════════════════════════════
-- 070 — Política de precios (recomendador con margen neto)
--   tenants.config_precios jsonb: margen neto deseado/mínimo, gastos fijos,
--   mezcla de pagos con tarjeta, mermas, hora-hombre y valores derivados
--   (multiplicadores) que usan POS e Inventario sin recalcular.
--   Sin datos sensibles; RLS de tenants ya lo protege.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS config_precios jsonb;
