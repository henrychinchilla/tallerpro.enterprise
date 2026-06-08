-- ═══════════════════════════════════════════════════════
-- 017 — Feedback / encuestas de clientes
--   Encuesta del QR (o por correo). El cliente identificado por
--   teléfono/correo gana 50 puntos de fidelización (vía triggers).
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  nombre          text,
  telefono        text,
  email           text,
  rating_servicio integer,
  rating_productos integer,
  nps             integer,
  comentario      text,
  puntos_otorgados integer DEFAULT 0,
  origen          text DEFAULT 'qr',
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.feedback;
CREATE POLICY tenant_isolation ON public.feedback FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
CREATE INDEX IF NOT EXISTS feedback_tenant_idx ON public.feedback(tenant_id, created_at DESC);
