-- ═══════════════════════════════════════════════════════
-- 019 — Reglas de puntos de fidelización
--   · Afiliación: 50 puntos UNA sola vez por cliente al inscribirse.
--   · Feedback: 50 puntos por respuesta, MÁXIMO 2 veces por mes.
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

-- Feedback con tope mensual (reemplaza la versión de la migración 018)
CREATE OR REPLACE FUNCTION public.fb_match_cliente() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; ptel text; v_cnt int;
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
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT count(*) INTO v_cnt FROM puntos_movimientos
      WHERE cliente_id = NEW.cliente_id AND motivo = 'Feedback / encuesta' AND tipo = 'gana'
        AND date_trunc('month', created_at) = date_trunc('month', now());
    NEW.puntos_otorgados := CASE WHEN v_cnt >= 2 THEN 0 ELSE 50 END;
  END IF;
  RETURN NEW;
END $$;

-- Bono de afiliación (una sola vez por cliente)
CREATE OR REPLACE FUNCTION public.award_afiliacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.programa_puntos IS TRUE AND (TG_OP = 'INSERT' OR coalesce(OLD.programa_puntos,false) = false) THEN
    IF NOT EXISTS (SELECT 1 FROM puntos_movimientos WHERE cliente_id = NEW.id AND motivo = 'Afiliación al programa') THEN
      INSERT INTO puntos_movimientos(tenant_id, cliente_id, tipo, puntos, motivo, referencia)
        VALUES (NEW.tenant_id, NEW.id, 'gana', 50, 'Afiliación al programa', 'afiliacion');
      UPDATE clientes SET puntos_saldo = coalesce(puntos_saldo,0) + 50 WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_afiliacion ON public.clientes;
CREATE TRIGGER trg_afiliacion AFTER INSERT OR UPDATE OF programa_puntos ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.award_afiliacion();
