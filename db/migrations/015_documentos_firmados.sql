-- ═══════════════════════════════════════════════════════
-- 015 — Documentos firmados (PDF en Storage + SHA-256)
--   Firma en pantalla → PDF (jsPDF) → bucket privado 'documentos'.
--   Visible desde el historial de cada entidad (OT, traslado, etc.).
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documentos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  entidad      text NOT NULL,
  entidad_id   uuid,
  tipo         text,
  titulo       text,
  storage_path text NOT NULL,
  sha256       text,
  firmantes    jsonb DEFAULT '[]'::jsonb,
  created_by   uuid,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.documentos;
CREATE POLICY tenant_isolation ON public.documentos FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
CREATE INDEX IF NOT EXISTS documentos_entidad_idx ON public.documentos(entidad, entidad_id);

-- Bucket privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos','documentos', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage por taller (primer segmento del path = tenant_id)
DROP POLICY IF EXISTS "documentos_tenant_select" ON storage.objects;
CREATE POLICY "documentos_tenant_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='documentos' AND ((storage.foldername(name))[1] = current_tenant_id()::text OR is_superadmin()));
DROP POLICY IF EXISTS "documentos_tenant_insert" ON storage.objects;
CREATE POLICY "documentos_tenant_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='documentos' AND ((storage.foldername(name))[1] = current_tenant_id()::text OR is_superadmin()));
DROP POLICY IF EXISTS "documentos_tenant_delete" ON storage.objects;
CREATE POLICY "documentos_tenant_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='documentos' AND ((storage.foldername(name))[1] = current_tenant_id()::text OR is_superadmin()));
