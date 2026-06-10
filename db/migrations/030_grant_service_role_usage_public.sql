-- ═══════════════════════════════════════════════════════
-- 030 — Restaurar USAGE de service_role en public (default de Supabase)
-- Un hardening previo dejó al rol service_role sin USAGE sobre el
-- esquema public: las Edge Functions (service role vía PostgREST)
-- no podían ejecutar RPCs ni consultar tablas (42501).
-- Detectado al probar backup-tenants → RPC get_cron_secret.
-- Aplicada vía MCP el 2026-06-10.
-- ═══════════════════════════════════════════════════════

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
