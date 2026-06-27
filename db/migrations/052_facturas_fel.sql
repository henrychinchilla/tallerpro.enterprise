-- ═══════════════════════════════════════════════════════
-- 052 — Vincular facturas con FEL emitido (ventas / ingresos)
--
-- Permite importar las facturas EMITIDAS del FEL del SAT a la tabla
-- 'facturas' para que aparezcan en Libro de Ventas y como ingreso.
-- Idempotente: índice único por (tenant, fel_importado_id).
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS fel_importado_id UUID REFERENCES public.fel_importados(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS facturas_fel_unico_idx
  ON public.facturas(tenant_id, fel_importado_id)
  WHERE fel_importado_id IS NOT NULL;
