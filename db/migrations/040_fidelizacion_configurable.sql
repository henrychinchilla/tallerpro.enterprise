-- ═══════════════════════════════════════════════════════
-- 040 — Políticas de fidelización configurables por taller
-- tenants.fidelizacion jsonb: { puntos_por_q, puntos_por_q1_canje,
--   bono_afiliacion, bono_feedback, feedback_max_mes }
-- Defaults (compatibles con lo anterior): 1, 10, 50, 50, 2.
-- Los triggers de afiliación y feedback leen la config del tenant
-- (bono <= 0 desactiva la regla). El frontend usa fidelizacionCfg().
-- Aplicada vía MCP el 2026-06-11.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS fidelizacion jsonb;

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
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT coalesce((fidelizacion->>'bono_feedback')::int, 50),
           coalesce((fidelizacion->>'feedback_max_mes')::int, 2)
      INTO v_bono, v_max FROM tenants WHERE id = NEW.tenant_id;
    SELECT count(*) INTO v_cnt FROM puntos_movimientos
      WHERE cliente_id = NEW.cliente_id AND motivo = 'Feedback / encuesta' AND tipo = 'gana'
        AND date_trunc('month', created_at) = date_trunc('month', now());
    NEW.puntos_otorgados := CASE WHEN coalesce(v_bono,50) <= 0 OR v_cnt >= coalesce(v_max,2)
                                 THEN 0 ELSE coalesce(v_bono,50) END;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.award_afiliacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bono int;
BEGIN
  IF NEW.programa_puntos IS TRUE AND (TG_OP = 'INSERT' OR coalesce(OLD.programa_puntos,false) = false) THEN
    SELECT coalesce((fidelizacion->>'bono_afiliacion')::int, 50) INTO v_bono
      FROM tenants WHERE id = NEW.tenant_id;
    IF coalesce(v_bono,50) > 0 AND NOT EXISTS (
      SELECT 1 FROM puntos_movimientos WHERE cliente_id = NEW.id AND motivo = 'Afiliación al programa'
    ) THEN
      INSERT INTO puntos_movimientos(tenant_id, cliente_id, tipo, puntos, motivo, referencia)
        VALUES (NEW.tenant_id, NEW.id, 'gana', v_bono, 'Afiliación al programa', 'afiliacion');
      UPDATE clientes SET puntos_saldo = coalesce(puntos_saldo,0) + v_bono WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
