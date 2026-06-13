-- ═══════════════════════════════════════════════════════
-- 042 — RRHH: Reclutamiento, Disciplina, Vacaciones, Horas extra/feriado
-- Nuevas tabs en RRHH & Nómina:
--  - Reclutamiento: vacantes + aplicantes
--  - Disciplina: llamadas de atención, amonestaciones, suspensiones,
--    sanciones económicas y despidos (Código de Trabajo de Guatemala)
--  - Vacaciones: control de goce/pago de vacaciones no gozadas
--  - Horas Extra: horas extraordinarias y trabajo en días feriados,
--    integradas a la nómina (pagos_nomina.extra_feriado)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vacantes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  puesto              text NOT NULL,
  departamento        text,
  descripcion         text,
  requisitos          text,
  salario_min         numeric,
  salario_max         numeric,
  vacantes_disponibles int DEFAULT 1,
  estado              text DEFAULT 'borrador', -- borrador | publicada | cerrada
  publicado_en        timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aplicantes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  vacante_id  uuid REFERENCES public.vacantes(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  telefono    text,
  email       text,
  cv_base64   text,
  cv_nombre   text,
  estado      text DEFAULT 'nuevo', -- nuevo | entrevista | rechazado | contratado
  notas       text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.disciplina (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  empleado_id       uuid REFERENCES public.empleados(id) ON DELETE CASCADE,
  tipo              text NOT NULL, -- Llamada de atención | Amonestación escrita | Suspensión | Sanción económica | Despido
  motivo            text NOT NULL,
  fecha             date NOT NULL DEFAULT current_date,
  articulo          text,         -- referencia al Código de Trabajo
  dias_suspension   int,
  monto_sancion     numeric,
  documento_base64  text,
  documento_nombre  text,
  created_by        uuid,
  created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vacaciones_movimientos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  empleado_id   uuid REFERENCES public.empleados(id) ON DELETE CASCADE,
  tipo          text NOT NULL, -- goce | pago
  fecha_inicio  date,
  fecha_fin     date,
  dias          numeric NOT NULL,
  monto         numeric,
  notas         text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.horas_extra (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  empleado_id   uuid REFERENCES public.empleados(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  tipo          text NOT NULL, -- extra | feriado_trabajado | feriado_descanso
  horas         numeric,
  factor        numeric,
  monto         numeric NOT NULL,
  pagada        boolean DEFAULT false,
  periodo_mes   int,
  periodo_anio  int,
  notas         text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.pagos_nomina ADD COLUMN IF NOT EXISTS extra_feriado numeric DEFAULT 0;

-- ── RLS: aislamiento por tenant ──────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vacantes','aplicantes','disciplina','vacaciones_movimientos','horas_extra']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY "tenant_isolation" ON public.%I
        FOR ALL TO authenticated
        USING      (tenant_id = public.current_tenant_id() OR public.is_superadmin())
        WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin())
    $f$, t);
  END LOOP;
END $$;
