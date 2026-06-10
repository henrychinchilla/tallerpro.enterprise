-- ═══════════════════════════════════════════════════════
-- 036 — Importador del reporte FEL de SAT
-- fel_importados.naturaleza distingue facturas 'emitida' (ventas,
-- verificación de débito) de 'recibida' (compras → IVA crédito).
-- El CSV se descarga de la Consulta FEL del portal SAT y se carga
-- en Contabilidad → Importar FEL. Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.fel_importados
  ADD COLUMN IF NOT EXISTS naturaleza text DEFAULT 'recibida'
  CHECK (naturaleza = ANY (ARRAY['recibida','emitida']));
CREATE INDEX IF NOT EXISTS fel_importados_periodo_idx
  ON public.fel_importados (tenant_id, naturaleza, fecha);
