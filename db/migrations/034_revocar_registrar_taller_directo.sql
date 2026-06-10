-- ═══════════════════════════════════════════════════════
-- 034 — Cerrar el bypass del registro directo de talleres
-- El alta ahora pasa por la Edge Function registrar-taller
-- (captcha Turnstile + tenant suspendido pendiente de aprobación).
-- Se revoca el RPC registrar_taller del cliente para que nadie
-- pueda saltarse el captcha llamándolo directo vía PostgREST.
-- Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.registrar_taller(text, text, text, text) FROM anon, authenticated, public;
