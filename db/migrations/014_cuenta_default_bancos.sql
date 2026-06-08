-- ═══════════════════════════════════════════════════════
-- 014 — Cuenta(s) bancaria(s) predeterminadas
--   Toda factura/ingreso entra a la cuenta de ingresos y todo
--   egreso/costo/planilla sale de la cuenta de egresos. Si solo
--   hay una cuenta, se usa por defecto; con varias, el admin marca
--   la predeterminada. El registro en banco_movimientos es automático
--   (DB._registrarBancoAuto).
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.bancos
  ADD COLUMN IF NOT EXISTS predeterminada_ingresos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS predeterminada_egresos  boolean DEFAULT false;
