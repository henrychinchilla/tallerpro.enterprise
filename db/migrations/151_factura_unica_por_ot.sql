-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 151
-- Una sola factura viva por OT
-- ═══════════════════════════════════════════════════════
-- La doble facturación de una OT solo la frenaba un SELECT previo en el
-- navegador (facturaDeOrden): dos clics o dos pestañas pasaban ambos y se
-- emitían dos facturas (y se descontaba el stock dos veces). La base lo
-- impide ahora. Una factura ANULADA no cuenta: se puede volver a facturar.
-- Verificado antes de aplicar: 0 duplicados en producción.

CREATE UNIQUE INDEX IF NOT EXISTS facturas_una_por_ot_idx
  ON public.facturas (tenant_id, ot_id)
  WHERE ot_id IS NOT NULL AND coalesce(estado, '') <> 'anulada';
