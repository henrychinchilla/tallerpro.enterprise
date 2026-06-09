-- ── MIGRACIÓN 025: TRIGGERS DE SINCRONIZACIÓN AUTOMÁTICA DE BANCOS ──

-- 1. Agregar columnas de referencia para ingresos y egresos en banco_movimientos
ALTER TABLE public.banco_movimientos ADD COLUMN IF NOT EXISTS ingreso_id UUID REFERENCES public.ingresos(id) ON DELETE CASCADE;
ALTER TABLE public.banco_movimientos ADD COLUMN IF NOT EXISTS egreso_id UUID REFERENCES public.egresos(id) ON DELETE CASCADE;

-- 2. Sincronizar/Vincular los movimientos bancarios existentes que se crearon previamente
UPDATE public.banco_movimientos bm
SET ingreso_id = i.id
FROM public.ingresos i
WHERE bm.ingreso_id IS NULL
  AND bm.tipo = 'entrada'
  AND bm.monto = i.monto
  AND bm.fecha = i.fecha
  AND COALESCE(bm.referencia, '') = COALESCE(i.referencia, '')
  AND bm.tenant_id = i.tenant_id;

UPDATE public.banco_movimientos bm
SET egreso_id = e.id
FROM public.egresos e
WHERE bm.egreso_id IS NULL
  AND bm.tipo = 'salida'
  AND bm.monto = e.monto
  AND bm.fecha = e.fecha
  AND COALESCE(bm.referencia, '') = COALESCE(e.referencia, '')
  AND bm.tenant_id = e.tenant_id;

-- 3. Limpiar triggers existentes por si acaso se ejecuta de nuevo
DROP TRIGGER IF EXISTS trg_sync_ingreso_to_banco ON public.ingresos;
DROP FUNCTION IF EXISTS public.fn_sync_ingreso_to_banco();

DROP TRIGGER IF EXISTS trg_sync_egreso_to_banco ON public.egresos;
DROP FUNCTION IF EXISTS public.fn_sync_egreso_to_banco();

-- 4. Crear función y trigger para sincronizar INGRESOS
CREATE OR REPLACE FUNCTION public.fn_sync_ingreso_to_banco()
RETURNS TRIGGER AS $$
DECLARE
  var_banco_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Obtener la cuenta predeterminada de ingresos (ahorro o predeterminada_ingresos, o la primera que haya)
    SELECT id INTO var_banco_id
    FROM public.bancos
    WHERE activa = true AND tenant_id = NEW.tenant_id
    ORDER BY predeterminada_ingresos DESC, (tipo = 'ahorro' OR tipo = 'ahorros') DESC, created_at ASC
    LIMIT 1;

    IF var_banco_id IS NOT NULL THEN
      INSERT INTO public.banco_movimientos (tenant_id, banco_id, tipo, concepto, monto, referencia, fecha, ingreso_id, conciliado)
      VALUES (NEW.tenant_id, var_banco_id, 'entrada', COALESCE(NEW.concepto, 'Ingreso'), NEW.monto, NEW.referencia, NEW.fecha, NEW.id, false);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Actualizar el movimiento correspondiente
    UPDATE public.banco_movimientos
    SET concepto = COALESCE(NEW.concepto, 'Ingreso'),
        monto = NEW.monto,
        referencia = NEW.referencia,
        fecha = NEW.fecha
    WHERE ingreso_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_ingreso_to_banco
AFTER INSERT OR UPDATE ON public.ingresos
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_ingreso_to_banco();

-- 5. Crear función y trigger para sincronizar EGRESOS
CREATE OR REPLACE FUNCTION public.fn_sync_egreso_to_banco()
RETURNS TRIGGER AS $$
DECLARE
  var_banco_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Obtener la cuenta predeterminada de egresos (monetaria o predeterminada_egresos, o la primera que haya)
    SELECT id INTO var_banco_id
    FROM public.bancos
    WHERE activa = true AND tenant_id = NEW.tenant_id
    ORDER BY predeterminada_egresos DESC, (tipo = 'monetaria') DESC, created_at ASC
    LIMIT 1;

    IF var_banco_id IS NOT NULL THEN
      INSERT INTO public.banco_movimientos (tenant_id, banco_id, tipo, concepto, monto, referencia, fecha, egreso_id, conciliado)
      VALUES (NEW.tenant_id, var_banco_id, 'salida', COALESCE(NEW.concepto, 'Egreso'), NEW.monto, NEW.referencia, NEW.fecha, NEW.id, false);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Actualizar el movimiento correspondiente
    UPDATE public.banco_movimientos
    SET concepto = COALESCE(NEW.concepto, 'Egreso'),
        monto = NEW.monto,
        referencia = NEW.referencia,
        fecha = NEW.fecha
    WHERE egreso_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_egreso_to_banco
AFTER INSERT OR UPDATE ON public.egresos
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_egreso_to_banco();

-- 6. Forzar recarga del caché de PostgREST
NOTIFY pgrst, 'reload schema';
