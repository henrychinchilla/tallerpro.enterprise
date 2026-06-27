-- ═══════════════════════════════════════════════════════
-- 054 — Clasificación fiscal de compras (deducible / crédito IVA)
--
-- El resumen FEL del SAT no trae el detalle de artículos, así que la
-- clasificación es a nivel de factura. Dos banderas fiscales:
--   deducible      → cuenta como costo en ISR (Estado de Resultados)
--   credito_iva    → genera crédito fiscal de IVA (SAT-2237)
-- Default seguro: 'por_clasificar' con ambas en false (NO computa hasta revisar).
-- proveedor_reglas recuerda la clasificación por NIT para próximas importaciones.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS categoria_gasto text DEFAULT 'por_clasificar',
  ADD COLUMN IF NOT EXISTS deducible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS credito_iva boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.proveedor_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nit text,
  nombre text,
  categoria_gasto text NOT NULL DEFAULT 'otros',
  deducible boolean NOT NULL DEFAULT true,
  credito_iva boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, nit)
);
ALTER TABLE public.proveedor_reglas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.proveedor_reglas;
CREATE POLICY tenant_isolation ON public.proveedor_reglas FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Backfill: el combustible (IODP) de un taller es gasto del negocio → deducible + crédito
UPDATE public.compras
SET categoria_gasto='combustible', deducible=true, credito_iva=true
WHERE es_combustible = true AND categoria_gasto = 'por_clasificar';
