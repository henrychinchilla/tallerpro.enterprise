-- ── MIGRACIÓN 027: AGREGAR COLUMNAS FALTANTES A INGRESOS/EGRESOS Y RE-INTENTAR SINCRONIZACIÓN ──

-- 1. Asegurar todas las columnas necesarias en la tabla 'public.ingresos'
ALTER TABLE public.ingresos ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE public.ingresos ADD COLUMN IF NOT EXISTS orden_id UUID REFERENCES public.ordenes(id) ON DELETE SET NULL;
ALTER TABLE public.ingresos ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- 2. Asegurar todas las columnas necesarias en la tabla 'public.egresos'
ALTER TABLE public.egresos ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE public.egresos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL;

-- 3. Asegurar columna 'num' en facturas (por consistencia con el código JS)
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS num TEXT;

-- 4. Poblar/Sincronizar retroactivamente facturas activas existentes a ingresos
-- (Esto disparará de forma segura el trigger 'trg_sync_ingreso_to_banco', 
-- poblando también los movimientos bancarios faltantes en la cuenta predeterminada)
INSERT INTO public.ingresos (tenant_id, concepto, categoria, monto, referencia, cliente_id, orden_id, fecha, notas, created_at)
SELECT 
  f.tenant_id, 
  'Factura ' || COALESCE(f.num, f.id::text), 
  'Ventas', 
  f.total, 
  COALESCE(f.num, f.id::text), 
  f.cliente_id, 
  f.orden_id, 
  f.fecha, 
  COALESCE(f.notas, 'Facturado correlativo ' || COALESCE(f.num, f.id::text)), 
  f.created_at
FROM public.facturas f
WHERE f.estado != 'anulada'
  AND NOT EXISTS (
    SELECT 1 FROM public.ingresos i 
    WHERE i.tenant_id = f.tenant_id 
      AND (i.referencia = f.num OR i.referencia = f.id::text)
  );

-- 5. Forzar recarga del caché de PostgREST
NOTIFY pgrst, 'reload schema';
