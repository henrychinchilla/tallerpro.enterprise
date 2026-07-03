-- ═══════════════════════════════════════════════════════
-- 071 — Activación de servicio por pago (demo vencido)
--   • saas_config: configuración global del SaaS (cuentas bancarias para
--     transferencias, email de pagos, montos por plan). Legible por cualquier
--     usuario autenticado (el cliente bloqueado necesita ver las cuentas);
--     solo superadmin escribe.
--   • vouchers_pago: el comercio sube su voucher de transferencia/depósito.
--     La Edge Function verificar-voucher lo analiza con IA y, si los datos
--     coinciden (monto, cuenta destino, no duplicado), lo aprueba y activa
--     el servicio automáticamente. Si no, queda en revisión para el Panel SaaS.
--   • tenant_tarjetas: se permite que el ADMIN del propio comercio registre
--     su tarjeta (antes solo superadmin). El token del gateway sigue siendo
--     exclusivo del superadmin/service_role (privilegios por columna, mig 069).
--   • aprobar_voucher / rechazar_voucher: única vía para activar (inserta el
--     cobro, extiende suscripcion_vence y reactiva el comercio). Ejecutable
--     solo por superadmin o service_role.
-- ═══════════════════════════════════════════════════════

-- 1. Config global del SaaS
CREATE TABLE IF NOT EXISTS public.saas_config (
  clave      text PRIMARY KEY,
  valor      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.saas_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leer_todos ON public.saas_config;
CREATE POLICY leer_todos ON public.saas_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sa_escribe ON public.saas_config;
CREATE POLICY sa_escribe ON public.saas_config FOR ALL
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

GRANT SELECT ON public.saas_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.saas_config TO authenticated;  -- RLS limita a superadmin

-- 2. Vouchers de pago subidos por los comercios
CREATE TABLE IF NOT EXISTS public.vouchers_pago (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  monto          numeric(12,2),                -- monto declarado por el cliente
  banco          text,
  referencia     text,                         -- no. de boleta / referencia declarada
  fecha_deposito date,
  imagen_base64  text,                         -- foto/PDF del voucher (comprimido en el cliente)
  analisis       jsonb,                        -- resultado de la lectura IA (Edge Function)
  referencia_detectada text,                   -- referencia leída por la IA (anti voucher repetido)
  estado         text NOT NULL DEFAULT 'revision'
                 CHECK (estado IN ('revision','aprobado','rechazado')),
  motivo_rechazo text,
  creado_por     uuid,
  created_at     timestamptz DEFAULT now(),
  revisado_at    timestamptz,
  revisado_por   uuid
);

CREATE INDEX IF NOT EXISTS idx_vouchers_pago_tenant ON public.vouchers_pago(tenant_id, estado);

ALTER TABLE public.vouchers_pago ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_propio ON public.vouchers_pago;
CREATE POLICY tenant_propio ON public.vouchers_pago FOR SELECT
  USING (tenant_id = public.current_tenant_id() OR public.is_superadmin());
DROP POLICY IF EXISTS tenant_sube ON public.vouchers_pago;
CREATE POLICY tenant_sube ON public.vouchers_pago FOR INSERT
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());
DROP POLICY IF EXISTS sa_gestiona ON public.vouchers_pago;
CREATE POLICY sa_gestiona ON public.vouchers_pago FOR UPDATE
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
DROP POLICY IF EXISTS sa_elimina ON public.vouchers_pago;
CREATE POLICY sa_elimina ON public.vouchers_pago FOR DELETE
  USING (public.is_superadmin());

GRANT SELECT, INSERT ON public.vouchers_pago TO authenticated;
GRANT UPDATE, DELETE ON public.vouchers_pago TO authenticated;  -- RLS limita a superadmin

-- Anti-abuso: máx. 5 vouchers por comercio por día + guard anti-PAN en textos
CREATE OR REPLACE FUNCTION public.validar_voucher_pago()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT count(*) FROM public.vouchers_pago
       WHERE tenant_id = NEW.tenant_id AND created_at::date = current_date) >= 5 THEN
    RAISE EXCEPTION 'Límite de vouchers por día alcanzado. Contacta a soporte NexusPro.';
  END IF;
  IF public.contiene_posible_pan(coalesce(NEW.referencia,'') || ' ' || coalesce(NEW.banco,'')) THEN
    RAISE EXCEPTION 'Seguridad: no se permite guardar números de tarjeta completos.';
  END IF;
  NEW.creado_por := coalesce(NEW.creado_por, auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validar_voucher_pago ON public.vouchers_pago;
CREATE TRIGGER trg_validar_voucher_pago
  BEFORE INSERT ON public.vouchers_pago
  FOR EACH ROW EXECUTE FUNCTION public.validar_voucher_pago();

-- 3. El admin del comercio puede registrar SU tarjeta de suscripción
--    (token_enc sigue fuera de su alcance por privilegios de columna, mig 069)
DROP POLICY IF EXISTS tenant_propia ON public.tenant_tarjetas;
CREATE POLICY tenant_propia ON public.tenant_tarjetas FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- 4. Aprobar voucher → registra el cobro, extiende la suscripción y reactiva.
--    Solo superadmin (Panel SaaS) o service_role (Edge verificar-voucher).
CREATE OR REPLACE FUNCTION public.aprobar_voucher(
  p_voucher_id uuid,
  p_monto      numeric DEFAULT NULL,   -- override del monto (default: el del voucher)
  p_meses      int     DEFAULT 1
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

  -- Cobro registrado (mismo formato que el Panel SaaS)
  INSERT INTO public.tenant_pagos (tenant_id, periodo, monto, metodo, estado, referencia, fecha)
  VALUES (v.tenant_id, to_char(current_date,'YYYY-MM'), monto, 'Transferencia', 'pagado',
          concat_ws(' · ', 'Voucher', nullif(v.referencia,''), nullif(v.banco,'')), current_date);

  -- Extiende desde hoy o desde el vencimiento vigente si aún es futuro
  vence := (greatest(coalesce(t.suscripcion_vence, current_date), current_date)
            + make_interval(months => p_meses))::date;

  UPDATE public.tenants
     SET active = true,
         suscripcion_vence = vence,
         precio_mensual = CASE WHEN coalesce(precio_mensual,0) = 0
                               THEN round(monto / p_meses, 2) ELSE precio_mensual END,
         notas_admin = concat('Activado por voucher el ', to_char(now(),'YYYY-MM-DD'),
                              ' (', p_meses, ' mes/es, Q', monto, ')'),
         updated_at = now()
   WHERE id = v.tenant_id;

  UPDATE public.vouchers_pago
     SET estado = 'aprobado', revisado_at = now(), revisado_por = auth.uid()
   WHERE id = p_voucher_id;

  RETURN jsonb_build_object('ok', true, 'tenant_id', v.tenant_id,
                            'suscripcion_vence', vence, 'monto', monto);
END $$;

REVOKE ALL ON FUNCTION public.aprobar_voucher(uuid, numeric, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_voucher(uuid, numeric, int) TO authenticated, service_role;

-- 5. Rechazar voucher (superadmin o service_role, con motivo)
CREATE OR REPLACE FUNCTION public.rechazar_voucher(p_voucher_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_superadmin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Solo superadmin puede rechazar vouchers';
  END IF;
  UPDATE public.vouchers_pago
     SET estado = 'rechazado', motivo_rechazo = p_motivo,
         revisado_at = now(), revisado_por = auth.uid()
   WHERE id = p_voucher_id AND estado = 'revision';
END $$;

REVOKE ALL ON FUNCTION public.rechazar_voucher(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rechazar_voucher(uuid, text) TO authenticated, service_role;

-- 6. Régimen SAT elegido desde el registro (lo copia verificar-registro a config_fiscal)
ALTER TABLE public.solicitudes_comercio
  ADD COLUMN IF NOT EXISTS regimen_iva text DEFAULT 'general';

-- 7. Config inicial de pagos (editable en Panel SaaS → Cobros → Cuentas de pago)
INSERT INTO public.saas_config (clave, valor) VALUES ('pago', jsonb_build_object(
  'cuentas', '[]'::jsonb,          -- [{banco, tipo, numero, titular}]
  'email_pagos', 'henry.chinchilla@gmail.com',
  'nota', 'Envía tu comprobante por este medio o súbelo directamente en la app.'
)) ON CONFLICT (clave) DO NOTHING;
