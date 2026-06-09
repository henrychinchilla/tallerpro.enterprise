-- ── MIGRACIÓN 026: SINCRONIZAR FACTURAS EXISTENTES A INGRESOS Y BANCOS ──

-- Insertar facturas activas existentes como ingresos si no están registradas
-- (Esto activará automáticamente el trigger trg_sync_ingreso_to_banco, registrando también el movimiento de banco de forma automática en la cuenta de ahorros predeterminada)
INSERT INTO public.ingresos (tenant_id, concepto, categoria, monto, referencia, cliente_id, orden_id, fecha, notas, created_at)
SELECT 
  f.tenant_id, 
  'Factura ' || f.num, 
  'Ventas', 
  f.total, 
  f.num, 
  f.cliente_id, 
  f.orden_id, 
  f.fecha, 
  COALESCE(f.notas, 'Facturado correlativo ' || f.num), 
  f.created_at
FROM public.facturas f
WHERE f.estado != 'anulada'
  AND NOT EXISTS (
    SELECT 1 FROM public.ingresos i 
    WHERE i.tenant_id = f.tenant_id AND i.referencia = f.num
  );

-- Forzar recarga del caché de PostgREST
NOTIFY pgrst, 'reload schema';
