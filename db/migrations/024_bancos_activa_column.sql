-- ── MIGRACIÓN 024: COLUMNA ACTIVA EN BANCOS Y SINCRONIZACIÓN DE MOVIMIENTOS ──
-- 1. Asegurar que la columna 'activa' existe en la tabla 'public.bancos'
ALTER TABLE public.bancos ADD COLUMN IF NOT EXISTS activa BOOLEAN DEFAULT true;

-- 2. Copiar datos de la columna antigua 'activo' si existe en la base de datos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bancos' AND column_name='activo') THEN
    UPDATE public.bancos SET activa = COALESCE(activo, true);
  END IF;
END $$;

-- 3. Sincronizar retroactivamente movimientos bancarios para ingresos/egresos existentes que no se registraron por el error de columna
DO $$
DECLARE
  var_banco_ingreso_id UUID;
  var_banco_egreso_id UUID;
  r_ingreso RECORD;
  r_egreso RECORD;
BEGIN
  -- Obtener la cuenta predeterminada de ingresos (ahorro o predeterminada_ingresos, o la primera que haya)
  SELECT id INTO var_banco_ingreso_id
  FROM public.bancos
  WHERE activa = true
  ORDER BY predeterminada_ingresos DESC, (tipo = 'ahorro' OR tipo = 'ahorros') DESC, created_at ASC
  LIMIT 1;

  -- Obtener la cuenta predeterminada de egresos (monetaria o predeterminada_egresos, o la primera que haya)
  SELECT id INTO var_banco_egreso_id
  FROM public.bancos
  WHERE activa = true
  ORDER BY predeterminada_egresos DESC, (tipo = 'monetaria') DESC, created_at ASC
  LIMIT 1;

  -- Si no hay bancos activos, no podemos sincronizar nada
  IF var_banco_ingreso_id IS NULL AND var_banco_egreso_id IS NULL THEN
    RETURN;
  END IF;

  -- Sincronizar Ingresos faltantes
  IF var_banco_ingreso_id IS NOT NULL THEN
    FOR r_ingreso IN 
      SELECT * FROM public.ingresos i
      WHERE NOT EXISTS (
        SELECT 1 FROM public.banco_movimientos bm 
        WHERE bm.banco_id = var_banco_ingreso_id 
          AND bm.tipo = 'entrada' 
          AND bm.monto = i.monto 
          AND bm.fecha = i.fecha 
          AND COALESCE(bm.referencia, '') = COALESCE(i.referencia, '')
      )
    LOOP
      INSERT INTO public.banco_movimientos (tenant_id, banco_id, tipo, concepto, monto, referencia, fecha, conciliado)
      VALUES (r_ingreso.tenant_id, var_banco_ingreso_id, 'entrada', COALESCE(r_ingreso.concepto, 'Ingreso'), r_ingreso.monto, r_ingreso.referencia, r_ingreso.fecha, false);
    END LOOP;
  END IF;

  -- Sincronizar Egresos faltantes
  IF var_banco_egreso_id IS NOT NULL THEN
    FOR r_egreso IN 
      SELECT * FROM public.egresos e
      WHERE NOT EXISTS (
        SELECT 1 FROM public.banco_movimientos bm 
        WHERE bm.banco_id = var_banco_egreso_id 
          AND bm.tipo = 'salida' 
          AND bm.monto = e.monto 
          AND bm.fecha = e.fecha 
          AND COALESCE(bm.referencia, '') = COALESCE(e.referencia, '')
      )
    LOOP
      INSERT INTO public.banco_movimientos (tenant_id, banco_id, tipo, concepto, monto, referencia, fecha, conciliado)
      VALUES (r_egreso.tenant_id, var_banco_egreso_id, 'salida', COALESCE(r_egreso.concepto, 'Egreso'), r_egreso.monto, r_egreso.referencia, r_egreso.fecha, false);
    END LOOP;
  END IF;
END $$;

-- 4. Forzar recarga del caché de PostgREST
NOTIFY pgrst, 'reload schema';
