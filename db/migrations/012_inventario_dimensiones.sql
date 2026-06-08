-- ═══════════════════════════════════════════════════════
-- 012 — Inventario: dimensiones del artículo (cm)
--   Complementa las columnas ya existentes (peso_kg, ubicacion,
--   num_parte_oem, estado_articulo, max_stock, compat_*) usadas por
--   el formulario ampliado de inventario.
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.inventario
  ADD COLUMN IF NOT EXISTS ancho_cm numeric,
  ADD COLUMN IF NOT EXISTS alto_cm  numeric,
  ADD COLUMN IF NOT EXISTS largo_cm numeric;
