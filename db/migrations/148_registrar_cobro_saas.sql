-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 148
-- El cobro manual del Panel SaaS RENUEVA la suscripción
-- ═══════════════════════════════════════════════════════
-- guardarCobro() solo insertaba en tenant_pagos: el comercio pagaba y seguía
-- "Vencido · en mora". aprobar_voucher (mig 071/072) sí extendía la fecha.
-- Este RPC es su equivalente para el cobro manual, en UNA transacción:
-- registra el pago y, si está 'pagado', extiende suscripcion_vence desde
-- max(vence, hoy) y reactiva el comercio.
--
-- Mora: vencido = bloqueo SUAVE (solo lectura, sigue active=true);
-- suspendido (active=false) = bloqueo DURO. Un cobro pagado limpia ambos.
-- "Hoy" es el de Guatemala, no el UTC del servidor.

CREATE OR REPLACE FUNCTION public.registrar_cobro_saas(
  p_tenant_id  uuid,
  p_monto      numeric,
  p_metodo     text,
  p_estado     text DEFAULT 'pagado',
  p_periodo    text DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_meses      integer DEFAULT 1
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t     public.tenants%ROWTYPE;
  hoy   date := (now() AT TIME ZONE 'America/Guatemala')::date;
  vence date;
  pago  uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo superadmin puede registrar cobros' USING errcode = '42501';
  END IF;
  IF coalesce(p_monto,0) <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  IF p_meses < 1 OR p_meses > 24 THEN RAISE EXCEPTION 'Meses fuera de rango (1-24)'; END IF;
  IF p_metodo NOT IN ('Transferencia','Depósito','Tarjeta','Efectivo','Cheque') THEN
    RAISE EXCEPTION 'Método inválido';
  END IF;
  IF p_estado NOT IN ('pagado','pendiente') THEN RAISE EXCEPTION 'Estado inválido'; END IF;

  SELECT * INTO t FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no encontrado'; END IF;

  INSERT INTO public.tenant_pagos (tenant_id, periodo, monto, metodo, estado, referencia, fecha)
  VALUES (p_tenant_id, coalesce(nullif(p_periodo,''), to_char(hoy,'YYYY-MM')), p_monto, p_metodo,
          p_estado, nullif(p_referencia,''), hoy)
  RETURNING id INTO pago;

  IF p_estado = 'pagado' THEN
    vence := (greatest(coalesce(t.suscripcion_vence, hoy), hoy) + make_interval(months => p_meses))::date;
    UPDATE public.tenants
       SET active = true,
           suscripcion_vence = vence,
           precio_mensual = CASE WHEN coalesce(precio_mensual,0) = 0
                                 THEN round(p_monto / p_meses, 2) ELSE precio_mensual END,
           notas_admin = concat('Activado por pago (', p_metodo, ') el ', to_char(hoy,'YYYY-MM-DD'),
                                ' (', p_meses, ' mes/es, Q', p_monto, ')'),
           updated_at = now()
     WHERE id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pago_id', pago, 'tenant_id', p_tenant_id,
                            'suscripcion_vence', coalesce(vence, t.suscripcion_vence));
END $function$;

REVOKE ALL ON FUNCTION public.registrar_cobro_saas(uuid,numeric,text,text,text,text,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_cobro_saas(uuid,numeric,text,text,text,text,integer) TO authenticated;
