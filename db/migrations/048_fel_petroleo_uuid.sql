-- ═══════════════════════════════════════════════════════
-- 048 — Enriquecer fel_importados con IODP (combustible) y UUID SAT
--
-- petroleo: monto IODP (Impuesto a la Distribución de Petróleo y Combustibles)
--           > 0 indica factura de combustible → deducible ISR
-- es_combustible: flag rápido para queries (true si petroleo > 0)
-- numero_autorizacion: UUID SAT del DTE (para deduplicación)
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.fel_importados
  ADD COLUMN IF NOT EXISTS petroleo         NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS es_combustible   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS numero_autorizacion TEXT;

CREATE INDEX IF NOT EXISTS fel_importados_combustible_idx
  ON public.fel_importados (tenant_id, es_combustible, fecha)
  WHERE es_combustible = true;
