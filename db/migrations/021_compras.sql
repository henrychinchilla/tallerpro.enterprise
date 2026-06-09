-- ═══════════════════════════════════════════════════════
-- 021 — Módulo de Compras (insumos / repuestos / aceites)
--   Registra compras con sus precios, actualiza inventario (stock+costo),
--   genera el egreso (cuenta de egresos / Finanzas) y guarda historial.
--   Se compara contra el presupuesto (categorías de compras).
-- Aplicada vía MCP el 2026-06-09.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.compras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  num             text,
  proveedor_id    uuid REFERENCES public.proveedores(id) ON DELETE SET NULL,
  proveedor_nombre text,
  num_factura     text,
  fecha           date DEFAULT CURRENT_DATE,
  subtotal        numeric DEFAULT 0,
  iva             numeric DEFAULT 0,
  total           numeric DEFAULT 0,
  estado          text DEFAULT 'recibida' CHECK (estado = ANY (ARRAY['recibida','pendiente','anulada'])),
  notas           text,
  egreso_id       uuid,
  created_at      timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.compra_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  compra_id     uuid REFERENCES public.compras(id) ON DELETE CASCADE,
  inventario_id uuid,
  descripcion   text,
  categoria     text,
  cantidad      numeric DEFAULT 1,
  costo_unit    numeric DEFAULT 0,
  total         numeric DEFAULT 0
);
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compra_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.compras;
CREATE POLICY tenant_isolation ON public.compras FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin()) WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
DROP POLICY IF EXISTS tenant_isolation ON public.compra_items;
CREATE POLICY tenant_isolation ON public.compra_items FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin()) WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
CREATE INDEX IF NOT EXISTS compras_tenant_fecha_idx ON public.compras(tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS compra_items_cid_idx ON public.compra_items(compra_id);
