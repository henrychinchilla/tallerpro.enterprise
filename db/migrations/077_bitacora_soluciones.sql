-- ═══════════════════════════════════════════════════════
-- 077 — Bitácora de Soluciones Técnicas
--   Memoria técnica de hallazgos y soluciones ya probadas por
--   los mecánicos, para reforzar la cultura de "esto ya se supo
--   resolver": título/síntoma, descripción de la solución, marca/
--   modelo y códigos DTC relacionados (opcional), quién la agregó,
--   cuántas veces se ha vuelto a ejecutar (bitacora_ejecuciones,
--   con quién/cuándo/en qué OT) y comentarios de otros mecánicos.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bitacora_soluciones (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  titulo              text NOT NULL,
  categoria           text NOT NULL DEFAULT 'general',   -- motor, electrico, transmision, frenos, ac, etc.
  sintoma             text,               -- qué presentaba el vehículo (para búsqueda)
  descripcion         text NOT NULL,      -- solución ejecutada / hallazgo técnico
  dtc_codigos         text[],             -- códigos relacionados, ej. {P0420,P0171}
  marca               text,
  modelo              text,
  veces_ejecutada     integer NOT NULL DEFAULT 1,   -- 1 al crearla; sincronizada por trigger con bitacora_ejecuciones
  creado_por          uuid,
  creado_por_nombre   text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Cada vez que un mecánico marca "yo también resolví esto así"
CREATE TABLE IF NOT EXISTS public.bitacora_ejecuciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  bitacora_id   uuid NOT NULL REFERENCES public.bitacora_soluciones(id) ON DELETE CASCADE,
  usuario_id    uuid,
  usuario_nombre text,
  orden_id      uuid REFERENCES public.ordenes(id)   ON DELETE SET NULL,
  vehiculo_id   uuid REFERENCES public.vehiculos(id) ON DELETE SET NULL,
  nota          text,               -- opcional: algo distinto que notó esta vez
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bitacora_comentarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  bitacora_id   uuid NOT NULL REFERENCES public.bitacora_soluciones(id) ON DELETE CASCADE,
  usuario_id    uuid,
  usuario_nombre text,
  comentario    text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.bitacora_soluciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_ejecuciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.bitacora_soluciones;
CREATE POLICY tenant_isolation ON public.bitacora_soluciones FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

DROP POLICY IF EXISTS tenant_isolation ON public.bitacora_ejecuciones;
CREATE POLICY tenant_isolation ON public.bitacora_ejecuciones FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

DROP POLICY IF EXISTS tenant_isolation ON public.bitacora_comentarios;
CREATE POLICY tenant_isolation ON public.bitacora_comentarios FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

CREATE INDEX IF NOT EXISTS bitacora_soluciones_tenant_idx    ON public.bitacora_soluciones(tenant_id, categoria);
CREATE INDEX IF NOT EXISTS bitacora_soluciones_usados_idx    ON public.bitacora_soluciones(tenant_id, veces_ejecutada DESC);
CREATE INDEX IF NOT EXISTS bitacora_ejecuciones_bitacora_idx ON public.bitacora_ejecuciones(bitacora_id);
CREATE INDEX IF NOT EXISTS bitacora_comentarios_bitacora_idx ON public.bitacora_comentarios(bitacora_id);

-- veces_ejecutada = 1 (autor) + ejecuciones registradas por otros mecánicos
CREATE OR REPLACE FUNCTION public.bitacora_recalc_ejecutada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bid uuid := COALESCE(NEW.bitacora_id, OLD.bitacora_id);
BEGIN
  UPDATE public.bitacora_soluciones
    SET veces_ejecutada = 1 + (SELECT count(*) FROM public.bitacora_ejecuciones WHERE bitacora_id = bid)
    WHERE id = bid;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_bitacora_ejecuciones_aiud ON public.bitacora_ejecuciones;
CREATE TRIGGER trg_bitacora_ejecuciones_aiud
  AFTER INSERT OR DELETE ON public.bitacora_ejecuciones
  FOR EACH ROW EXECUTE FUNCTION public.bitacora_recalc_ejecutada();
