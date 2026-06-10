-- ═══════════════════════════════════════════════════════
-- 026 — Datos de entrega en envíos
--   Columnas reales para el envío al cliente desde el POS
--   (antes iban embebidas en notas). Permiten filtrar/mostrar
--   por separado en el módulo de Envíos.
-- Aplicada vía MCP el 2026-06-09 (nombre original: envios_datos_entrega).
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.envios
  ADD COLUMN IF NOT EXISTS telefono   text,
  ADD COLUMN IF NOT EXISTS direccion  text,
  ADD COLUMN IF NOT EXISTS municipio  text,
  ADD COLUMN IF NOT EXISTS referencias text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid;
