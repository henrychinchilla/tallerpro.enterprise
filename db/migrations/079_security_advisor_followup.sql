-- 079 — Cierre de superficie residual reportada por Security Advisor.

-- La tabla es interna de las Edge Functions; declarar su único consumidor
-- también deja explícita la intención para RLS y el auditor de Supabase.
CREATE POLICY feedback_tokens_service_role ON public.feedback_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger interno: no debe ser invocable como RPC por anon/authenticated.
REVOKE ALL ON FUNCTION public.bitacora_recalc_ejecutada() FROM PUBLIC, anon, authenticated;
