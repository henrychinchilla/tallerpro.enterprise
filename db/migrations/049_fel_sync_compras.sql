-- ═══════════════════════════════════════════════════════
-- 049 — Sincronizar FEL con Compras
--
-- Agregar referencia a fel_importados en compras para trazabilidad
-- y permitir importar automáticamente facturas recibidas del FEL.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS fel_importado_id UUID REFERENCES public.fel_importados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_importacion BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS num_dua TEXT,
  ADD COLUMN IF NOT EXISTS cif_valor NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS dai_monto NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS iva_frontera NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS compras_fel_idx ON public.compras(tenant_id, fel_importado_id)
  WHERE fel_importado_id IS NOT NULL;
