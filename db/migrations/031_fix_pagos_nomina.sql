-- ═══════════════════════════════════════════════════════
-- 031 — Alinear pagos_nomina con el código de RRHH
-- El cálculo de nómina fallaba por tres desalineaciones:
--   • faltaba la columna isr (el código la inserta)
--   • el código usa 'liquido' pero la tabla tenía 'liquido_pagar'
--   • el upsert onConflict (empleado_id,periodo_mes,periodo_anio)
--     requería un UNIQUE que no existía
-- Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.pagos_nomina RENAME COLUMN liquido_pagar TO liquido;
ALTER TABLE public.pagos_nomina ADD COLUMN IF NOT EXISTS isr numeric DEFAULT 0;
ALTER TABLE public.pagos_nomina
  ADD CONSTRAINT pagos_nomina_periodo_unico UNIQUE (empleado_id, periodo_mes, periodo_anio);
