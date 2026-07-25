-- 081 — Apertura, arqueo y cierre de caja para POS.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS config_pos_caja jsonb
  NOT NULL DEFAULT '{"fondo_inicial_sugerido": 500}'::jsonb;

CREATE TABLE IF NOT EXISTS public.cajas_pos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  usuario_apertura_id uuid NOT NULL REFERENCES public.usuarios(id),
  usuario_cierre_id uuid REFERENCES public.usuarios(id),
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  fondo_inicial numeric(12,2) NOT NULL CHECK (fondo_inicial >= 0),
  efectivo_esperado numeric(12,2),
  efectivo_contado numeric(12,2),
  diferencia numeric(12,2),
  ventas_efectivo numeric(12,2) NOT NULL DEFAULT 0,
  ventas_total numeric(12,2) NOT NULL DEFAULT 0,
  num_ventas integer NOT NULL DEFAULT 0,
  notas_apertura text,
  notas_cierre text,
  abierta_at timestamptz NOT NULL DEFAULT now(),
  cerrada_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caja_pos_cierre_completo CHECK (
    (estado = 'abierta' AND cerrada_at IS NULL)
    OR (estado = 'cerrada' AND cerrada_at IS NOT NULL AND efectivo_esperado IS NOT NULL
        AND efectivo_contado IS NOT NULL AND diferencia IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS cajas_pos_una_abierta_por_tenant_idx
  ON public.cajas_pos (tenant_id) WHERE estado = 'abierta';
CREATE INDEX IF NOT EXISTS cajas_pos_tenant_fecha_idx
  ON public.cajas_pos (tenant_id, abierta_at DESC);

ALTER TABLE public.cajas_pos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cajas_pos_tenant_isolation ON public.cajas_pos;
CREATE POLICY cajas_pos_tenant_isolation ON public.cajas_pos FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

GRANT SELECT, INSERT, UPDATE ON public.cajas_pos TO authenticated;
GRANT ALL ON public.cajas_pos TO service_role;
