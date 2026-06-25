-- ═══════════════════════════════════════════════════════════════
-- TallerPro Enterprise — Migración 046
-- Permite facturar una cotización aprobada directamente (sin pasar
-- por una Orden de Trabajo), análogo al flujo OT → Factura ya
-- existente. Idempotente.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS cotizacion_id uuid REFERENCES public.cotizaciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_facturas_cotizacion ON public.facturas(cotizacion_id);

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS convertida_factura_id uuid REFERENCES public.facturas(id) ON DELETE SET NULL;
