-- ═══════════════════════════════════════════════════════
-- 043 — Formularios Tributarios SAT (DeclaraGuate)
-- Declaraciones llenables IVA / ISR / ISO con cálculo en tiempo real,
-- pestaña "Formularios SAT" dentro de Contabilidad / SAT. Esquema
-- portado fielmente de FerreProGT (db/migrations/0015_tributario_forms.sql),
-- adaptado a Postgres/Supabase (uuid, jsonb, RLS).
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.formularios_tributarios (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  tipo_formulario    text NOT NULL CHECK (tipo_formulario IN
                       ('SAT-2237','SAT-2046','SAT-1311','SAT-1361','SAT-1608','SAT-1331','SAT-2085','SAT-1431')),
  nit                text NOT NULL,
  periodo_mes        text,
  periodo_anio       text NOT NULL,
  numero_formulario  text NOT NULL,
  numero_acceso      text NOT NULL,
  estado             text NOT NULL DEFAULT 'preparacion' CHECK (estado IN ('preparacion','presentado','pagado')),
  datos_formulario   jsonb NOT NULL DEFAULT '{}'::jsonb,
  monto_impuesto     numeric NOT NULL DEFAULT 0,
  monto_accesorios   numeric NOT NULL DEFAULT 0,
  total_pagar        numeric NOT NULL DEFAULT 0,
  fecha_pago         date,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_formtrib_tenant   ON public.formularios_tributarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_formtrib_periodo  ON public.formularios_tributarios(periodo_anio, periodo_mes);

ALTER TABLE public.formularios_tributarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.formularios_tributarios;
CREATE POLICY "tenant_isolation" ON public.formularios_tributarios
  FOR ALL TO authenticated
  USING      (tenant_id = public.current_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());
