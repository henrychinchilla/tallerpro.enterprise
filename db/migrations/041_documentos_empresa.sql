-- ═══════════════════════════════════════════════════════
-- 041 — Documentos legales de la empresa
-- Tab "Documentos Legales" en Administración: patente de comercio,
-- patente de empresa, RTU, registro mercantil, escritura de sociedad,
-- nombramiento de representante legal, DPI representante legal, y
-- documentos personalizados (nombre libre). Visible solo para
-- Dueño/Administración/Gerencia con PERMISOS.doc_empresa habilitado
-- (ver js/core/config.js → puedeVerDocsEmpresa).
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documentos_empresa (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  tipo           text NOT NULL,
  nombre_archivo text,
  base64         text,
  es_pdf         boolean DEFAULT false,
  created_by     uuid,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE public.documentos_empresa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.documentos_empresa;
CREATE POLICY "tenant_isolation" ON public.documentos_empresa
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());
