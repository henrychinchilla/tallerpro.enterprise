-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 153
-- Canal B: integraciones PROPIAS del comercio (pagos con tarjeta y FEL)
-- ═══════════════════════════════════════════════════════
-- Es un SaaS: el comercio contrata su pasarela y su certificador FEL y
-- carga SUS credenciales. Canal B nunca usa credenciales de CM (Canal A) y
-- CM nunca usa estas para cobrar la suscripción.
--
-- Secretos: cifrados con pgp_sym_encrypt y una llave de Vault PROPIA de
-- este canal ('integraciones_tenant_key', distinta de la de tarjetas de
-- Canal A). El navegador nunca puede leer secreto_enc (privilegio por
-- columna): ve proveedor, ambiente, datos públicos y una pista "…a1b2".
-- Solo service_role (Edge) descifra, siempre para un tenant concreto.
--
-- Hoy ningún proveedor tiene conector: guardar y "probar" funcionan, el
-- uso real devuelve "sin conector" — nunca un cobro ni un FEL falsos.
-- Flag saas_config.integraciones_byo.activo=false: la pantalla de pagos
-- solo la ve el superadmin hasta encenderlo.

CREATE TABLE IF NOT EXISTS public.tenant_integraciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('pagos','fel')),
  proveedor     text NOT NULL,
  ambiente      text NOT NULL DEFAULT 'test' CHECK (ambiente IN ('test','live')),
  publico       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- NIT emisor, usuario, publishable key…
  secreto_enc   bytea,                               -- JSON de secretos, CIFRADO
  secreto_pista text,                                -- "…a1b2", para reconocerlo sin verlo
  activo        boolean NOT NULL DEFAULT true,
  ultimo_error  text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (tenant_id, tipo)
);

ALTER TABLE public.tenant_integraciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integraciones_lectura ON public.tenant_integraciones;
CREATE POLICY integraciones_lectura ON public.tenant_integraciones FOR SELECT
  USING (tenant_id = public.current_tenant_id() OR public.is_superadmin());

-- Escritura SOLO por RPC; lectura sin la columna cifrada.
REVOKE ALL ON public.tenant_integraciones FROM anon, authenticated;
GRANT SELECT (id, tenant_id, tipo, proveedor, ambiente, publico, secreto_pista, activo, ultimo_error, created_at, updated_at)
  ON public.tenant_integraciones TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'integraciones_tenant_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
      'integraciones_tenant_key', 'Llave de cifrado de credenciales de integraciones propias de cada comercio (Canal B)');
  END IF;
END $$;

INSERT INTO public.saas_config (clave, valor)
VALUES ('integraciones_byo', jsonb_build_object('activo', false))
ON CONFLICT (clave) DO NOTHING;

-- ¿Quién puede administrar las integraciones de p_tenant? El superadmin, o
-- un admin/gerente financiero de ESE comercio.
CREATE OR REPLACE FUNCTION public._puede_integraciones(p_tenant uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select public.is_superadmin() or exists (
    select 1 from public.usuarios u
     where u.id = auth.uid() and u.tenant_id = p_tenant and u.activo is not false
       and u.rol in ('admin','gerente_fin'))
$$;

-- Guardar / rotar. p_secretos = NULL conserva el secreto actual (editar sin
-- volver a escribirlo); '{}' lo borra.
CREATE OR REPLACE FUNCTION public.guardar_integracion(
  p_tenant_id uuid, p_tipo text, p_proveedor text, p_ambiente text,
  p_publico jsonb DEFAULT '{}'::jsonb, p_secretos jsonb DEFAULT NULL, p_activo boolean DEFAULT true
) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE k text; pista text; primero text; fila public.tenant_integraciones;
BEGIN
  IF NOT public._puede_integraciones(p_tenant_id) THEN
    RAISE EXCEPTION 'Solo el administrador del comercio puede cambiar sus integraciones' USING errcode = '42501';
  END IF;
  IF p_tipo NOT IN ('pagos','fel') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF coalesce(p_proveedor,'') !~ '^[a-z0-9_]{2,40}$' THEN RAISE EXCEPTION 'Proveedor inválido'; END IF;
  IF p_ambiente NOT IN ('test','live') THEN RAISE EXCEPTION 'Ambiente inválido'; END IF;
  IF public.contiene_posible_pan(coalesce(p_publico::text,'') || ' ' || coalesce(p_secretos::text,'')) THEN
    RAISE EXCEPTION 'Seguridad: eso parece un número de tarjeta. Aquí van llaves del proveedor, nunca tarjetas.';
  END IF;
  -- Ningún secreto en la parte pública (la ve cualquier usuario del comercio)
  IF coalesce(p_publico::text,'') ~* '"[^"]*(secret|password|clave|llave_api|token|private)[^"]*"\s*:' THEN
    RAISE EXCEPTION 'Los secretos no van en los datos públicos';
  END IF;

  INSERT INTO public.tenant_integraciones (tenant_id, tipo, proveedor, ambiente, publico, activo)
  VALUES (p_tenant_id, p_tipo, p_proveedor, p_ambiente, coalesce(p_publico,'{}'::jsonb), coalesce(p_activo,true))
  ON CONFLICT (tenant_id, tipo) DO UPDATE
     SET proveedor = EXCLUDED.proveedor, ambiente = EXCLUDED.ambiente, publico = EXCLUDED.publico,
         activo = EXCLUDED.activo, ultimo_error = NULL, updated_at = now()
  RETURNING * INTO fila;

  IF p_secretos IS NOT NULL THEN
    IF p_secretos = '{}'::jsonb THEN
      UPDATE public.tenant_integraciones SET secreto_enc = NULL, secreto_pista = NULL WHERE id = fila.id;
    ELSE
      SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'integraciones_tenant_key';
      SELECT value INTO primero FROM jsonb_each_text(p_secretos) WHERE coalesce(value,'') <> '' LIMIT 1;
      pista := CASE WHEN length(coalesce(primero,'')) >= 8 THEN '…' || right(primero, 4) ELSE '…' END;
      UPDATE public.tenant_integraciones
         SET secreto_enc = extensions.pgp_sym_encrypt(p_secretos::text, k), secreto_pista = pista
       WHERE id = fila.id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', fila.id);
END $$;

CREATE OR REPLACE FUNCTION public.borrar_integracion(p_tenant_id uuid, p_tipo text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public._puede_integraciones(p_tenant_id) THEN
    RAISE EXCEPTION 'Solo el administrador del comercio puede cambiar sus integraciones' USING errcode = '42501';
  END IF;
  DELETE FROM public.tenant_integraciones WHERE tenant_id = p_tenant_id AND tipo = p_tipo;
END $$;

-- Descifrar: SOLO service_role (Edge), para el tenant que la Edge ya validó.
CREATE OR REPLACE FUNCTION public.leer_secreto_integracion(p_tenant_id uuid, p_tipo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE k text; s text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'integraciones_tenant_key';
  SELECT pgp_sym_decrypt(secreto_enc, k) INTO s FROM public.tenant_integraciones
   WHERE tenant_id = p_tenant_id AND tipo = p_tipo AND secreto_enc IS NOT NULL;
  RETURN s::jsonb;
END $$;

REVOKE ALL ON FUNCTION public._puede_integraciones(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.guardar_integracion(uuid,text,text,text,jsonb,jsonb,boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.borrar_integracion(uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.leer_secreto_integracion(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._puede_integraciones(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_integracion(uuid,text,text,text,jsonb,jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.borrar_integracion(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leer_secreto_integracion(uuid,text) TO service_role;
