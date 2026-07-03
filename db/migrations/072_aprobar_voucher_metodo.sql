-- ═══════════════════════════════════════════════════════
-- 072 — aprobar_voucher con método de pago
--   El paywall ahora permite "cobro único con tarjeta" (solicitud sin guardar
--   la tarjeta): esa solicitud entra a vouchers_pago y al aprobarla el cobro
--   debe registrarse con método 'Tarjeta', no 'Transferencia'.
--   Se recrea aprobar_voucher con p_metodo (default 'Transferencia').
-- ═══════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.aprobar_voucher(uuid, numeric, int);

CREATE OR REPLACE FUNCTION public.aprobar_voucher(
  p_voucher_id uuid,
  p_monto      numeric DEFAULT NULL,
  p_meses      int     DEFAULT 1,
  p_metodo     text    DEFAULT 'Transferencia'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v      public.vouchers_pago%ROWTYPE;
  t      public.tenants%ROWTYPE;
  monto  numeric;
  vence  date;
BEGIN
  IF NOT (public.is_superadmin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Solo superadmin puede aprobar vouchers';
  END IF;

  SELECT * INTO v FROM public.vouchers_pago WHERE id = p_voucher_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher no encontrado'; END IF;
  IF v.estado <> 'revision' THEN RAISE EXCEPTION 'El voucher ya fue % previamente', v.estado; END IF;

  SELECT * INTO t FROM public.tenants WHERE id = v.tenant_id;
  monto := coalesce(p_monto, v.monto);
  IF coalesce(monto,0) <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  IF p_meses < 1 OR p_meses > 24 THEN RAISE EXCEPTION 'Meses fuera de rango (1-24)'; END IF;
  IF p_metodo NOT IN ('Transferencia','Depósito','Tarjeta','Efectivo','Cheque') THEN
    RAISE EXCEPTION 'Método inválido';
  END IF;

  INSERT INTO public.tenant_pagos (tenant_id, periodo, monto, metodo, estado, referencia, fecha)
  VALUES (v.tenant_id, to_char(current_date,'YYYY-MM'), monto, p_metodo, 'pagado',
          concat_ws(' · ', 'Voucher', nullif(v.referencia,''), nullif(v.banco,'')), current_date);

  vence := (greatest(coalesce(t.suscripcion_vence, current_date), current_date)
            + make_interval(months => p_meses))::date;

  UPDATE public.tenants
     SET active = true,
         suscripcion_vence = vence,
         precio_mensual = CASE WHEN coalesce(precio_mensual,0) = 0
                               THEN round(monto / p_meses, 2) ELSE precio_mensual END,
         notas_admin = concat('Activado por pago (', p_metodo, ') el ', to_char(now(),'YYYY-MM-DD'),
                              ' (', p_meses, ' mes/es, Q', monto, ')'),
         updated_at = now()
   WHERE id = v.tenant_id;

  UPDATE public.vouchers_pago
     SET estado = 'aprobado', revisado_at = now(), revisado_por = auth.uid()
   WHERE id = p_voucher_id;

  RETURN jsonb_build_object('ok', true, 'tenant_id', v.tenant_id,
                            'suscripcion_vence', vence, 'monto', monto);
END $$;

REVOKE ALL ON FUNCTION public.aprobar_voucher(uuid, numeric, int, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_voucher(uuid, numeric, int, text) TO authenticated, service_role;
