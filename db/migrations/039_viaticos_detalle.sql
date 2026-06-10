-- ═══════════════════════════════════════════════════════
-- 039 — Desglose del viático según tipo
-- combustible: { km, galones, costo_galon } · hospedaje: { noches }
-- Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.viaticos ADD COLUMN IF NOT EXISTS detalle jsonb;
