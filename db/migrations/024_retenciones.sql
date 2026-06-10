-- ═══════════════════════════════════════════════════════
-- 024 — Retenciones (ISR / IVA)
--   Registro de retenciones sufridas (nos las retuvieron, acreditables)
--   y efectuadas (las retuvimos, por enterar a la SAT). Alimenta el
--   resumen mensual de Retenciones / ISR en Finanzas.
-- Aplicada vía MCP el 2026-06-09.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.retenciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  fecha       date DEFAULT CURRENT_DATE,
  tipo        text DEFAULT 'ISR' CHECK (tipo = ANY (ARRAY['ISR','IVA'])),
  naturaleza  text DEFAULT 'sufrida' CHECK (naturaleza = ANY (ARRAY['sufrida','efectuada'])),
  documento   text,
  contraparte text,
  base        numeric DEFAULT 0,
  porcentaje  numeric DEFAULT 0,
  monto       numeric DEFAULT 0,
  notas       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.retenciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.retenciones;
CREATE POLICY tenant_isolation ON public.retenciones FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin()) WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
CREATE INDEX IF NOT EXISTS retenciones_tenant_fecha_idx ON public.retenciones(tenant_id, fecha DESC);
