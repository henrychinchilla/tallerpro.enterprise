-- ═══════════════════════════════════════════════════════
-- 050 — Evitar compras duplicadas desde FEL
--
-- Una compra por DTE del FEL (por tenant). El índice único hace que
-- la importación sea idempotente: reimportar no crea duplicados.
-- Aplicada vía MCP el 2026-06-26 (tras limpiar 287 duplicados existentes).
-- ═══════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS compras_fel_unico_idx
  ON public.compras(tenant_id, fel_importado_id)
  WHERE fel_importado_id IS NOT NULL;
