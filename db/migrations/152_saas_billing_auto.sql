-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 152
-- Canal A: cobro SaaS AUTOMÁTICO (CM → comercio) — base, APAGADO
-- ═══════════════════════════════════════════════════════
-- Canal A = CM Telecomm le cobra la suscripción al comercio con credenciales
-- de CM (secrets de la plataforma). NUNCA usa credenciales del comercio
-- (Canal B, tenant_integraciones). El medio del comercio es la tarjeta que
-- ya existe en tenant_tarjetas (token cifrado, mig 069).
--
-- Política (saas_config.billing_auto, editable desde el Panel SaaS):
--   • intentos de cargo en D−3, D−1 y D0 (días antes del vencimiento);
--   • si falla, reintentos en D+1 y D+3;
--   • vencido = bloqueo SUAVE (solo lectura, "Vencido · en mora");
--   • pasada la gracia (gracia_dias) sin pago → corte DURO: active=false.
--   • éxito → registrar_cobro_saas (el MISMO RPC del cobro manual y del
--     voucher): pago + renovación en una transacción, sin cobros huérfanos.
-- Arranca con activo=false: la Edge saas-cobrar solo SIMULA hasta que el
-- superadmin lo encienda y exista el conector de la pasarela contratada.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_intentos       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_ultimo_intento timestamptz,
  ADD COLUMN IF NOT EXISTS billing_ultimo_error   text;

INSERT INTO public.saas_config (clave, valor)
VALUES ('billing_auto', jsonb_build_object(
  'activo', false,
  'gateway', null,                 -- 'credomatic' | 'visanet' | 'stripe' | … (contrato de CM)
  'gracia_dias', 5,
  'dias_previos', jsonb_build_array(3, 1, 0),
  'reintentos_dias', jsonb_build_array(1, 3)))
ON CONFLICT (clave) DO NOTHING;

-- registrar_cobro_saas: además del superadmin, la Edge de cobro automático
-- (service_role). Mismo cuerpo que la mig 148 + reinicio de intentos.
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
  IF NOT (public.is_superadmin() OR auth.role() = 'service_role') THEN
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
           billing_intentos = 0, billing_ultimo_error = NULL,
           updated_at = now()
     WHERE id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'pago_id', pago, 'tenant_id', p_tenant_id,
                            'suscripcion_vence', coalesce(vence, t.suscripcion_vence));
END $function$;

REVOKE ALL ON FUNCTION public.registrar_cobro_saas(uuid,numeric,text,text,text,text,integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_cobro_saas(uuid,numeric,text,text,text,text,integer) TO authenticated, service_role;

-- Cron diario 07:50 GT. Con billing_auto.activo=false la Edge solo simula.
SELECT cron.unschedule('saas-cobrar-diario') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'saas-cobrar-diario');
SELECT cron.schedule('saas-cobrar-diario', '50 13 * * *', $cron$
  SELECT net.http_post(
    url := 'https://oanguccrxleznozumpbi.supabase.co/functions/v1/saas-cobrar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);
