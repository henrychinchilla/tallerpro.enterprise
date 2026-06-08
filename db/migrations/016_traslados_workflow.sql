-- ═══════════════════════════════════════════════════════
-- 016 — Traslados con workflow y firmas
--   solicitud → enviado (firma encargado + piloto) → recibido (firma).
--   El stock sale del origen al enviar y entra al destino al recibir.
--   Cada paso genera un PDF firmado (tabla documentos) trazable.
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.traslados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  num             text,
  bodega_origen_id  uuid REFERENCES public.bodegas(id) ON DELETE SET NULL,
  bodega_destino_id uuid REFERENCES public.bodegas(id) ON DELETE SET NULL,
  origen_nombre   text,
  destino_nombre  text,
  estado          text DEFAULT 'solicitado'
                  CHECK (estado = ANY (ARRAY['solicitado','enviado','recibido','cancelado'])),
  motivo          text,
  piloto_nombre   text,
  piloto_tipo     text CHECK (piloto_tipo IS NULL OR piloto_tipo = ANY (ARRAY['interno','externo'])),
  responsable_envia  text,
  responsable_recibe text,
  envio_id        uuid REFERENCES public.envios(id) ON DELETE SET NULL,
  doc_envio_id    uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  doc_recepcion_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  fecha_solicitud date DEFAULT CURRENT_DATE,
  fecha_envio     timestamptz,
  fecha_recepcion timestamptz,
  notas           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.traslado_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  traslado_id   uuid REFERENCES public.traslados(id) ON DELETE CASCADE,
  inventario_id uuid,
  nombre        text,
  cantidad      numeric DEFAULT 0,
  unidad        text
);
ALTER TABLE public.traslados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traslado_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.traslados;
CREATE POLICY tenant_isolation ON public.traslados FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
DROP POLICY IF EXISTS tenant_isolation ON public.traslado_items;
CREATE POLICY tenant_isolation ON public.traslado_items FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
CREATE INDEX IF NOT EXISTS traslados_estado_idx ON public.traslados(tenant_id, estado);
CREATE INDEX IF NOT EXISTS traslado_items_tid_idx ON public.traslado_items(traslado_id);
