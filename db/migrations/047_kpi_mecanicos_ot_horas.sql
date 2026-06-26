-- ═══════════════════════════════════════════════════════
-- 047 — KPI Mecánicos: tabla ot_horas + vista agregada
-- Permite registrar horas trabajadas por mecánico por OT,
-- calculadas distribuyendo la jornada diaria de planilla
-- entre las órdenes atendidas ese día.
-- ═══════════════════════════════════════════════════════

-- Registro de horas por OT y mecánico
CREATE TABLE IF NOT EXISTS public.ot_horas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  orden_id      uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  mecanico_id   uuid NOT NULL REFERENCES public.empleados(id) ON DELETE CASCADE,
  fecha         date NOT NULL DEFAULT CURRENT_DATE,
  horas         numeric(5,2) NOT NULL DEFAULT 0 CHECK (horas >= 0),
  notas         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (tenant_id, orden_id, mecanico_id, fecha)
);

ALTER TABLE public.ot_horas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_ot_horas" ON public.ot_horas
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());

-- Índices para las consultas de KPI
CREATE INDEX IF NOT EXISTS idx_ot_horas_tenant_mec  ON public.ot_horas (tenant_id, mecanico_id);
CREATE INDEX IF NOT EXISTS idx_ot_horas_fecha        ON public.ot_horas (tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ot_horas_orden        ON public.ot_horas (orden_id);

-- Vista de KPIs agregados por mecánico (no materializada, siempre fresca)
-- Se consulta filtrando por tenant_id + rango de fechas desde la app
CREATE OR REPLACE VIEW public.v_kpi_mecanicos AS
SELECT
  oh.tenant_id,
  oh.mecanico_id,
  e.nombre                                          AS mecanico_nombre,
  e.cargo,
  e.salario_base,
  DATE_TRUNC('month', oh.fecha)::date              AS periodo,
  COUNT(DISTINCT oh.orden_id)                       AS ots_con_horas,
  COALESCE(SUM(oh.horas), 0)                        AS horas_totales,
  COALESCE(SUM(o.total), 0)                         AS ingresos_generados,
  -- Costo hora-hombre estimado: salario bruto mensual / 240 horas mes
  ROUND(
    COALESCE(e.salario_base, 0) * 1.1567 / 240, 2
  )                                                  AS costo_hh,
  -- Ingresos generados por hora trabajada
  CASE WHEN COALESCE(SUM(oh.horas), 0) > 0
    THEN ROUND(COALESCE(SUM(o.total), 0) / SUM(oh.horas), 2)
    ELSE 0
  END                                                AS ingreso_por_hh,
  COUNT(DISTINCT CASE WHEN o.estado = 'entregado' THEN o.id END) AS ots_entregadas,
  COUNT(DISTINCT CASE WHEN o.es_garantia = true   THEN o.id END) AS garantias
FROM public.ot_horas oh
JOIN public.empleados e ON e.id = oh.mecanico_id
JOIN public.ordenes   o ON o.id = oh.orden_id
GROUP BY
  oh.tenant_id, oh.mecanico_id, e.nombre, e.cargo,
  e.salario_base, DATE_TRUNC('month', oh.fecha)::date;

COMMENT ON TABLE  public.ot_horas IS 'Horas trabajadas por mecánico en cada OT — base para KPIs hora-hombre';
COMMENT ON VIEW   public.v_kpi_mecanicos IS 'KPIs agregados por mecánico y período';
