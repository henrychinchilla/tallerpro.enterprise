-- ═══════════════════════════════════════════════════════
-- 028 — Capa SaaS comercial
--   • tenants: plan/módulos activos, precio, vencimiento de suscripción
--   • tenant_pagos: cobros mensuales por taller (solo superadmin)
--   • tenant_backups: bitácora de respaldos (taller ve los suyos; SA todos)
-- Aplicada vía MCP el 2026-06-09 (nombre original: saas_comercial).
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS modulos_activos jsonb,
  ADD COLUMN IF NOT EXISTS suscripcion_vence date,
  ADD COLUMN IF NOT EXISTS precio_mensual numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ciclo_pago text DEFAULT 'mensual',
  ADD COLUMN IF NOT EXISTS notas_admin text;

CREATE TABLE IF NOT EXISTS public.tenant_pagos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  periodo     text,                       -- 'YYYY-MM'
  fecha       date DEFAULT CURRENT_DATE,
  monto       numeric DEFAULT 0,
  metodo      text,
  estado      text DEFAULT 'pagado' CHECK (estado = ANY (ARRAY['pagado','pendiente'])),
  referencia  text,
  notas       text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE public.tenant_pagos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_only ON public.tenant_pagos;
CREATE POLICY sa_only ON public.tenant_pagos FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());
CREATE INDEX IF NOT EXISTS tenant_pagos_tenant_idx ON public.tenant_pagos(tenant_id, periodo);

CREATE TABLE IF NOT EXISTS public.tenant_backups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  fecha       timestamptz DEFAULT now(),
  tipo        text DEFAULT 'manual' CHECK (tipo = ANY (ARRAY['manual','automatico'])),
  tablas      integer DEFAULT 0,
  registros   integer DEFAULT 0,
  tamano_kb   numeric DEFAULT 0,
  creado_por  text,
  notas       text
);
ALTER TABLE public.tenant_backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.tenant_backups;
CREATE POLICY tenant_isolation ON public.tenant_backups FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
CREATE INDEX IF NOT EXISTS tenant_backups_tenant_idx ON public.tenant_backups(tenant_id, fecha DESC);
