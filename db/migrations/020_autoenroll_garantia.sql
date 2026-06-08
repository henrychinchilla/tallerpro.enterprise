-- ═══════════════════════════════════════════════════════
-- 020 — Auto-enrolamiento de fidelización + OT de garantía
--   · Cliente con teléfono Y correo → se inscribe al programa
--     automáticamente al crearse (gana 50 pts de afiliación).
--   · OT por garantía: ligada a la OT original, con responsable
--     (taller = costo / cliente = facturable).
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_enroll_cliente() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(trim(NEW.email),'') <> '' AND coalesce(trim(NEW.tel),'') <> '' THEN
    NEW.programa_puntos := true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_auto_enroll ON public.clientes;
CREATE TRIGGER trg_auto_enroll BEFORE INSERT ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.auto_enroll_cliente();

ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS es_garantia boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ot_origen_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS garantia_responsable text
    CHECK (garantia_responsable IS NULL OR garantia_responsable = ANY (ARRAY['taller','cliente']));
