-- ═══════════════════════════════════════════════════════
-- 013 — Programa de fidelización / puntos
--   Política: Q1 gastado = 1 punto · canje 10 puntos = Q1 ·
--   feedback = 50 puntos. Saldo por cliente + bitácora.
-- Aplicada vía MCP el 2026-06-08.
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS programa_puntos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS puntos_saldo integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.puntos_movimientos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  cliente_id  uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo        text NOT NULL DEFAULT 'gana' CHECK (tipo = ANY (ARRAY['gana','canje','ajuste'])),
  puntos      integer NOT NULL DEFAULT 0,   -- positivo = gana, negativo = canje
  motivo      text,
  referencia  text,
  factura_id  uuid,
  fecha       date DEFAULT CURRENT_DATE,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.puntos_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.puntos_movimientos;
CREATE POLICY tenant_isolation ON public.puntos_movimientos FOR ALL
  USING (tenant_id = current_tenant_id() OR is_superadmin())
  WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

CREATE INDEX IF NOT EXISTS puntos_mov_cliente_idx ON public.puntos_movimientos(cliente_id);
