-- ═══════════════════════════════════════════════════════
-- 051 — Combustible en compras (para SAT: IVA y deducción ISR)
--
-- Copiar el flag de combustible y el IODP desde el FEL a la compra
-- para que los formularios SAT separen el combustible:
--   • SAT-2237: fila de combustible (crédito IVA)
--   • SAT-1411/1361: combustible como costo deducible ISR
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS es_combustible BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS petroleo NUMERIC(14,2) DEFAULT 0;

-- Backfill: compras ya importadas desde FEL toman el flag de su DTE
UPDATE public.compras c
SET es_combustible = f.es_combustible,
    petroleo = f.petroleo
FROM public.fel_importados f
WHERE c.fel_importado_id = f.id
  AND f.es_combustible = true;
