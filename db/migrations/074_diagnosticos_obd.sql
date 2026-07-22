-- ═══════════════════════════════════════════════════════
-- 074 — Diagnóstico OBD-II (escaneos con adaptador ELM327/BLE)
--   Cada fila es un escaneo: VIN leído, códigos de falla (DTC)
--   confirmados y pendientes, snapshot de datos en vivo y si se
--   borraron códigos. Ligado al vehículo y opcionalmente a una OT.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.diagnosticos_obd (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  vehiculo_id     uuid REFERENCES public.vehiculos(id) ON DELETE SET NULL,
  orden_id        uuid REFERENCES public.ordenes(id)   ON DELETE SET NULL,
  vin             text,
  protocolo       text,               -- descripción ATDP (ej. ISO 15765-4 CAN)
  adaptador       text,               -- nombre BLE del dispositivo
  voltaje         text,               -- ATRV (ej. 12.4V)
  mil             boolean DEFAULT false,   -- luz Check Engine encendida
  dtcs            jsonb   DEFAULT '[]'::jsonb,  -- [{codigo,desc}]
  dtcs_pendientes jsonb   DEFAULT '[]'::jsonb,
  datos           jsonb   DEFAULT '{}'::jsonb,  -- snapshot en vivo {rpm,vel,temp,...}
  dtcs_borrados   boolean DEFAULT false,
  notas           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.diagnosticos_obd ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.diagnosticos_obd;
CREATE POLICY tenant_isolation ON public.diagnosticos_obd FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

CREATE INDEX IF NOT EXISTS diagnosticos_obd_tenant_fecha_idx
  ON public.diagnosticos_obd(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS diagnosticos_obd_vehiculo_idx
  ON public.diagnosticos_obd(vehiculo_id);
