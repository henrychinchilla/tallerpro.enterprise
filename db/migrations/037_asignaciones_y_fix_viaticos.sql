-- ═══════════════════════════════════════════════════════
-- 037 — Asignaciones al empleado (acta firmable) + fix viáticos
--   • viaticos: el código siempre envió tipo/referencia/aprobado pero
--     las columnas no existían → el guardado fallaba (PGRST204).
--   • empleado_asignaciones: licencias, aplicaciones, herramientas y
--     vehículos entregados al empleado, con acta formal (firma digital
--     con su usuario o impresa) y fotos del estado.
--   • Tipos de documento IGSS/IRTRA renombrados a Carné.
-- Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.viaticos
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS aprobado boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.empleado_asignaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  empleado_id     uuid NOT NULL REFERENCES public.empleados(id),
  tipo            text DEFAULT 'herramienta'
                  CHECK (tipo = ANY (ARRAY['herramienta','vehiculo','licencia','aplicacion','equipo','otro'])),
  descripcion     text NOT NULL,
  identificador   text,
  estado_entrega  text,
  fotos           jsonb,
  fecha_entrega   date DEFAULT CURRENT_DATE,
  fecha_devolucion date,
  estado          text DEFAULT 'asignado' CHECK (estado = ANY (ARRAY['asignado','devuelto'])),
  firma_tipo      text,
  firmado_por     uuid,
  firma_nombre    text,
  firma_fecha     timestamptz,
  devolucion_notas text,
  notas           text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.empleado_asignaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.empleado_asignaciones;
CREATE POLICY tenant_isolation ON public.empleado_asignaciones FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
CREATE INDEX IF NOT EXISTS emp_asig_idx ON public.empleado_asignaciones (tenant_id, empleado_id, estado);

UPDATE public.empleado_documentos SET tipo = 'Carné IGSS'  WHERE tipo = 'IGSS';
UPDATE public.empleado_documentos SET tipo = 'Carné IRTRA' WHERE tipo = 'IRTRA';
