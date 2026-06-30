-- ═══════════════════════════════════════════════════════════════
-- 056 — Agregar estado 'anulado' a facturas (emitidas) y compras
--       para el reporte SAT-2237 (IVA General)
--
-- Permite anular facturas/compras y reportar el conteo separado
-- en el formulario de IVA trimestral. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- 1) Agregar campo estado a facturas si no existe
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS estado text DEFAULT 'certificada';

-- 2) Agregar constraint para validar valores de estado en facturas
ALTER TABLE public.facturas
  DROP CONSTRAINT IF EXISTS facturas_estado_check,
  ADD CONSTRAINT facturas_estado_check
    CHECK (estado IN ('certificada', 'anulada', 'borrador', 'pendiente'));

-- 3) Verificar que compras ya tiene el constraint (debería estar en mig 021)
ALTER TABLE public.compras
  DROP CONSTRAINT IF EXISTS compras_estado_check,
  ADD CONSTRAINT compras_estado_check
    CHECK (estado IN ('recibida', 'pendiente', 'anulada'));

-- 4) Índices para búsquedas rápidas por estado
CREATE INDEX IF NOT EXISTS idx_facturas_estado
  ON public.facturas(tenant_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compras_estado
  ON public.compras(tenant_id, estado, fecha DESC);
