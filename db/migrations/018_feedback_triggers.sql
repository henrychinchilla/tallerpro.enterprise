-- ═══════════════════════════════════════════════════════
-- 018 — Feedback: inserción pública + puntos por triggers
--   La encuesta pública (anónima) inserta feedback; los triggers
--   SECURITY DEFINER emparejan al cliente y otorgan 50 puntos.
--   (No depende del service role.)
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

DROP POLICY IF EXISTS feedback_public_insert ON public.feedback;
CREATE POLICY feedback_public_insert ON public.feedback FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fb_match_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; ptel text;
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
  IF NEW.cliente_id IS NOT NULL THEN NEW.puntos_otorgados := 50; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fb_match ON public.feedback;
CREATE TRIGGER trg_fb_match BEFORE INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.fb_match_cliente();

CREATE OR REPLACE FUNCTION public.fb_apply_puntos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL AND coalesce(NEW.puntos_otorgados,0) > 0 THEN
    INSERT INTO puntos_movimientos(tenant_id, cliente_id, tipo, puntos, motivo, referencia)
      VALUES (NEW.tenant_id, NEW.cliente_id, 'gana', NEW.puntos_otorgados, 'Feedback / encuesta', 'feedback');
    UPDATE clientes SET programa_puntos = true,
        puntos_saldo = coalesce(puntos_saldo,0) + NEW.puntos_otorgados, updated_at = now()
      WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fb_puntos ON public.feedback;
CREATE TRIGGER trg_fb_puntos AFTER INSERT ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.fb_apply_puntos();
