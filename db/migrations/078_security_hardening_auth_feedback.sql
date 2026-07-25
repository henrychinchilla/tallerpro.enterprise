-- 078 — Cierre de escalamiento por metadata, feedback público y búsqueda de talleres
-- Aplicar con Supabase MCP al proyecto oanguccrxleznozumpbi.

-- Los user_metadata son editables por el propio usuario. Ningún trigger de
-- Auth puede convertirlos en tenant_id o rol de autorización.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Los únicos flujos autorizados crean el perfil explícitamente con service_role.
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- El login público necesita elegir taller, pero no debe permitir comodines ni
-- divulgar NIT. Tres caracteres y escape de LIKE reducen enumeración masiva.
DROP FUNCTION IF EXISTS public.buscar_talleres(text);
CREATE OR REPLACE FUNCTION public.buscar_talleres(q text)
RETURNS TABLE(id uuid, name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT t.id, t.name, t.slug
  FROM public.tenants AS t
  WHERE t.active IS TRUE
    AND length(trim(coalesce(q, ''))) >= 3
    AND t.name ILIKE '%' || replace(replace(replace(trim(q), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
  ORDER BY t.name
  LIMIT 8;
$$;
REVOKE ALL ON FUNCTION public.buscar_talleres(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_talleres(text) TO anon, authenticated;

-- Un QR genérico puede seguir recoger feedback, pero sólo un enlace enviado a
-- un cliente identificado obtiene puntos; el token expira y se consume una vez.
CREATE TABLE IF NOT EXISTS public.feedback_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.feedback_tokens FROM anon, authenticated;

ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS feedback_token_id uuid
  REFERENCES public.feedback_tokens(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS feedback_token_one_response_idx
  ON public.feedback(feedback_token_id) WHERE feedback_token_id IS NOT NULL;

DROP POLICY IF EXISTS feedback_public_insert ON public.feedback;
CREATE POLICY feedback_public_insert ON public.feedback FOR INSERT TO anon, authenticated
  WITH CHECK (
    cliente_id IS NULL
    AND feedback_token_id IS NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = tenant_id AND t.active IS TRUE)
  );

CREATE OR REPLACE FUNCTION public.fb_apply_puntos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.feedback_token_id IS NOT NULL
     AND NEW.cliente_id IS NOT NULL
     AND coalesce(NEW.puntos_otorgados,0) > 0 THEN
    INSERT INTO puntos_movimientos(tenant_id, cliente_id, tipo, puntos, motivo, referencia)
      VALUES (NEW.tenant_id, NEW.cliente_id, 'gana', NEW.puntos_otorgados, 'Feedback / encuesta', 'feedback');
    UPDATE clientes SET programa_puntos = true,
        puntos_saldo = coalesce(puntos_saldo,0) + NEW.puntos_otorgados, updated_at = now()
      WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END $$;

-- Recalcula el bono sólo para el cliente que quedó ligado a un token válido.
CREATE OR REPLACE FUNCTION public.fb_match_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; ptel text; v_cnt int; v_bono int; v_max int;
BEGIN
  IF NEW.cliente_id IS NULL THEN
    IF coalesce(trim(NEW.email),'') <> '' THEN
      SELECT id INTO v_id FROM clientes WHERE tenant_id = NEW.tenant_id AND lower(email) = lower(trim(NEW.email)) LIMIT 1;
    END IF;
    IF v_id IS NULL AND NEW.telefono IS NOT NULL THEN
      ptel := regexp_replace(NEW.telefono, '[^0-9]', '', 'g');
      IF length(ptel) >= 6 THEN
        SELECT id INTO v_id FROM clientes WHERE tenant_id = NEW.tenant_id
          AND regexp_replace(coalesce(tel,''), '[^0-9]', '', 'g') LIKE '%'||ptel||'%' LIMIT 1;
      END IF;
    END IF;
    IF v_id IS NOT NULL THEN NEW.cliente_id := v_id; END IF;
  END IF;
  IF NEW.feedback_token_id IS NOT NULL AND NEW.cliente_id IS NOT NULL THEN
    SELECT coalesce((fidelizacion->>'bono_feedback')::int, 50),
           coalesce((fidelizacion->>'feedback_max_mes')::int, 2)
      INTO v_bono, v_max FROM tenants WHERE id = NEW.tenant_id;
    SELECT count(*) INTO v_cnt FROM puntos_movimientos
      WHERE cliente_id = NEW.cliente_id AND motivo = 'Feedback / encuesta' AND tipo = 'gana'
        AND date_trunc('month', created_at) = date_trunc('month', now());
    NEW.puntos_otorgados := CASE WHEN coalesce(v_bono,50) <= 0 OR v_cnt >= coalesce(v_max,2)
                                 THEN 0 ELSE coalesce(v_bono,50) END;
  ELSE
    NEW.puntos_otorgados := 0;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fb_match_cliente() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fb_apply_puntos() FROM PUBLIC, anon, authenticated;
