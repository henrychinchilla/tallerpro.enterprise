-- ═══════════════════════════════════════════════════════
-- 069 — Cobro con tarjeta (POS del comercio + suscripción SaaS)
--   • tenants.config_pos_tarjeta: config OPCIONAL del POS físico VISA/Credomatic
--   • facturas.tarjeta_datos: voucher del cobro (solo autorización + últimos 4;
--     NUNCA número completo ni CVV — no hay nada que clonar si hackean la BD)
--   • tenant_tarjetas: tarjeta de suscripción por comercio (cargo manual/automático).
--     El token del gateway se cifra (pgp_sym_encrypt) con llave en Vault y el
--     cliente web jamás puede leerlo (privilegios por columna + función service_role).
--   • Guard anti-PAN: triggers que RECHAZAN cualquier secuencia de 13-19 dígitos
--     (posible tarjeta completa) en los campos relacionados con tarjeta.
-- ═══════════════════════════════════════════════════════

-- 1. Config POS tarjeta por comercio (mismo patrón que config_smtp / config_infile)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS config_pos_tarjeta jsonb;

-- 2. Voucher de tarjeta en facturas (POS / facturación)
ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS tarjeta_datos jsonb;

-- 3. Detector de posible PAN (número de tarjeta completo)
CREATE OR REPLACE FUNCTION public.contiene_posible_pan(txt text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(coalesce(txt,''), '[\s\-]', '', 'g') ~ '[0-9]{13,19}'
$$;

CREATE OR REPLACE FUNCTION public.validar_sin_pan_factura()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tarjeta_datos IS NOT NULL AND public.contiene_posible_pan(NEW.tarjeta_datos::text) THEN
    RAISE EXCEPTION 'Seguridad: no se permite guardar números de tarjeta completos. Registra solo autorización y últimos 4 dígitos.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sin_pan_facturas ON public.facturas;
CREATE TRIGGER trg_sin_pan_facturas
  BEFORE INSERT OR UPDATE OF tarjeta_datos ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.validar_sin_pan_factura();

-- 4. Tarjeta de suscripción por comercio (solo superadmin; 1 tarjeta por comercio)
CREATE TABLE IF NOT EXISTS public.tenant_tarjetas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  titular          text,
  marca            text,                                  -- VISA / MASTERCARD / OTRA
  ultimos4         text CHECK (ultimos4 IS NULL OR ultimos4 ~ '^[0-9]{4}$'),
  exp_mes          int  CHECK (exp_mes IS NULL OR exp_mes BETWEEN 1 AND 12),
  exp_anio         int  CHECK (exp_anio IS NULL OR exp_anio BETWEEN 2024 AND 2100),
  cargo_automatico boolean DEFAULT false,                 -- true = cargo recurrente; false = manual
  gateway          text,                                  -- 'credomatic' | 'visanet' | otro
  token_enc        bytea,                                 -- token del gateway CIFRADO; nunca el PAN
  notas            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.tenant_tarjetas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_only ON public.tenant_tarjetas;
CREATE POLICY sa_only ON public.tenant_tarjetas FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

-- El token cifrado NO es legible ni escribible desde el cliente web (ni superadmin):
-- privilegios por columna; solo la función service_role puede tocarlo.
REVOKE ALL ON public.tenant_tarjetas FROM anon, authenticated;
GRANT SELECT (id, tenant_id, titular, marca, ultimos4, exp_mes, exp_anio, cargo_automatico, gateway, notas, created_at, updated_at)
  ON public.tenant_tarjetas TO authenticated;
GRANT INSERT (tenant_id, titular, marca, ultimos4, exp_mes, exp_anio, cargo_automatico, gateway, notas)
  ON public.tenant_tarjetas TO authenticated;
GRANT UPDATE (titular, marca, ultimos4, exp_mes, exp_anio, cargo_automatico, gateway, notas, updated_at)
  ON public.tenant_tarjetas TO authenticated;
GRANT DELETE ON public.tenant_tarjetas TO authenticated;

-- Guard anti-PAN también en tenant_tarjetas (titular / notas / gateway)
CREATE OR REPLACE FUNCTION public.validar_sin_pan_tarjeta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.contiene_posible_pan(coalesce(NEW.titular,'') || ' ' || coalesce(NEW.notas,'') || ' ' || coalesce(NEW.gateway,'')) THEN
    RAISE EXCEPTION 'Seguridad: no se permite guardar números de tarjeta completos. Guarda solo los últimos 4 dígitos.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sin_pan_tenant_tarjetas ON public.tenant_tarjetas;
CREATE TRIGGER trg_sin_pan_tenant_tarjetas
  BEFORE INSERT OR UPDATE ON public.tenant_tarjetas
  FOR EACH ROW EXECUTE FUNCTION public.validar_sin_pan_tarjeta();

-- 5. Llave de cifrado en Vault (se crea una sola vez)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'tarjeta_token_key') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),
      'tarjeta_token_key', 'Llave de cifrado de tokens de tarjeta (gateway de pagos)');
  END IF;
END $$;

-- 6. Guardar token cifrado (superadmin llama por RPC; el token viaja por TLS y
--    se cifra al vuelo — nunca queda en claro en ninguna tabla)
CREATE OR REPLACE FUNCTION public.sa_guardar_token_tarjeta(p_tarjeta_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE k text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Solo superadmin puede guardar tokens de tarjeta';
  END IF;
  IF public.contiene_posible_pan(p_token) THEN
    RAISE EXCEPTION 'Seguridad: eso parece un número de tarjeta. Guarda el TOKEN que entrega el gateway, nunca el número de la tarjeta.';
  END IF;
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'tarjeta_token_key';
  UPDATE public.tenant_tarjetas
     SET token_enc = CASE WHEN coalesce(p_token,'') = '' THEN NULL
                          ELSE extensions.pgp_sym_encrypt(p_token, k) END,
         updated_at = now()
   WHERE id = p_tarjeta_id;
END $$;

REVOKE ALL ON FUNCTION public.sa_guardar_token_tarjeta(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sa_guardar_token_tarjeta(uuid, text) TO authenticated;

-- 7. Leer el token: SOLO service_role (Edge Function de cobro automático).
--    Ni el navegador ni superadmin pueden descifrarlo.
CREATE OR REPLACE FUNCTION public.leer_token_tarjeta(p_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE k text; tok text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'tarjeta_token_key';
  SELECT pgp_sym_decrypt(token_enc, k) INTO tok
    FROM public.tenant_tarjetas WHERE tenant_id = p_tenant_id AND token_enc IS NOT NULL;
  RETURN tok;
END $$;

REVOKE ALL ON FUNCTION public.leer_token_tarjeta(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leer_token_tarjeta(uuid) TO service_role;
