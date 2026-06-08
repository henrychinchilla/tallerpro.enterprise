-- ═══════════════════════════════════════════════════════
-- 010 — Trabajos externos / subcontratados de una OT
--   Ej.: enviar discos de freno al torno. Registra costos
--   (servicio + envío), comisión del taller, autorización
--   del cliente y su respuesta (whatsapp/correo). Cuando se
--   autoriza, se vuelca a la OT (ot_items) → factura.
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.trabajos_externos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  orden_id      uuid REFERENCES public.ordenes(id) ON DELETE CASCADE,
  descripcion   text NOT NULL,
  proveedor     text,
  costo_servicio numeric DEFAULT 0,
  costo_envio   numeric DEFAULT 0,
  comision_pct  numeric DEFAULT 0,
  comision_monto numeric DEFAULT 0,
  total_cliente numeric DEFAULT 0,
  requiere_autorizacion boolean DEFAULT true,
  estado        text DEFAULT 'pendiente'
                CHECK (estado = ANY (ARRAY['pendiente','autorizado','rechazado','en_proceso','completado'])),
  canal         text,
  notificado_at timestamptz,
  respuesta     text,
  respondido_at timestamptz,
  cargado_ot    boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.trabajos_externos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.trabajos_externos;
CREATE POLICY tenant_isolation ON public.trabajos_externos FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

CREATE INDEX IF NOT EXISTS trabajos_externos_orden_idx ON public.trabajos_externos(orden_id);
