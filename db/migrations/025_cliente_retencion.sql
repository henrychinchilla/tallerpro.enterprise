-- ═══════════════════════════════════════════════════════
-- 025 — Cliente agente de retención (ISR / IVA)
--   Marca a clientes que son agentes de retención y los
--   porcentajes que retienen. Al facturarles, db.js
--   (_retencionAutoFactura) inserta automáticamente las
--   retenciones 'sufridas' (acreditables) en la tabla
--   retenciones (ver 024_retenciones.sql).
-- Aplicada vía MCP el 2026-06-09 (nombre original: fase12_cliente_retencion).
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS agente_retencion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ret_iva_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ret_isr_pct numeric DEFAULT 0;
