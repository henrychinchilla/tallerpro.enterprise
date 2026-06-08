-- ═══════════════════════════════════════════════════════
-- 011 — Envíos / Fletes (logística)
--   Traslados internos (medio + viáticos + combustible),
--   fletes externos, envíos a proveedores (torno, rectificadora)
--   y couriers (Cargo Expreso, Guatex, Forza, PedidosYa...).
--   Con fecha de entrega estimada (seguimiento), cierre y archivo.
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.envios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  tipo          text NOT NULL DEFAULT 'externo'
                CHECK (tipo = ANY (ARRAY['interno','externo','proveedor','courier'])),
  descripcion   text NOT NULL,
  destinatario  text,
  empresa_transporte text,
  medio         text CHECK (medio IS NULL OR medio = ANY (ARRAY['moto','vehiculo','camion','cabezal','otro'])),
  responsable   text,
  orden_id           uuid REFERENCES public.ordenes(id) ON DELETE SET NULL,
  trabajo_externo_id uuid REFERENCES public.trabajos_externos(id) ON DELETE SET NULL,
  bodega_origen_id   uuid REFERENCES public.bodegas(id) ON DELETE SET NULL,
  bodega_destino_id  uuid REFERENCES public.bodegas(id) ON DELETE SET NULL,
  costo_flete   numeric DEFAULT 0,
  viaticos      numeric DEFAULT 0,
  combustible   numeric DEFAULT 0,
  costo_total   numeric DEFAULT 0,
  numero_envio  text,
  num_factura   text,
  fecha_envio   date,
  fecha_entrega_estimada date,
  fecha_entrega_real date,
  estado        text DEFAULT 'programado'
                CHECK (estado = ANY (ARRAY['programado','en_transito','entregado','cerrado'])),
  archivado     boolean DEFAULT false,
  notas         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE public.envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.envios;
CREATE POLICY tenant_isolation ON public.envios FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

CREATE INDEX IF NOT EXISTS envios_tenant_archivado_idx ON public.envios(tenant_id, archivado);
CREATE INDEX IF NOT EXISTS envios_orden_idx ON public.envios(orden_id);
