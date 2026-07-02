-- ═══════════════════════════════════════════════════════
-- 068 — Resolver warnings del Security Advisor: funciones SECURITY DEFINER
--        ejecutables por anon/authenticated sin necesidad real.
--
-- • registrar_taller: revocado en mig 034 (evita saltarse Turnstile +
--   aprobación) pero el advisor mostró que hoy SIGUE ejecutable por
--   'authenticated' (se revirtió solo, probablemente por un DROP+CREATE
--   posterior fuera de las migraciones versionadas). Se vuelve a revocar:
--   es un bypass real del flujo de registro actual (registrar-taller /
--   verificar-registro / registrar-comercio-google).
-- • verificar_licencia(p_tenant_id uuid): acepta un tenant_id arbitrario,
--   SECURITY DEFINER, y NO se usa en ningún flujo del cliente (código
--   muerto desde el frontend). Permitía a cualquier usuario autenticado
--   consultar datos de licencia de OTROS comercios (fuga cross-tenant).
--   Se revoca por completo.
-- • award_afiliacion / fb_apply_puntos / fb_match_cliente: son funciones
--   de TRIGGER (se ejecutan solas al insertar/actualizar filas); nunca
--   deben llamarse como RPC directo. Revocar EXECUTE no afecta su
--   funcionamiento como triggers (Postgres los invoca sin chequear el
--   grant del rol que hizo el INSERT/UPDATE), solo cierra la superficie
--   expuesta vía /rest/v1/rpc/....
--
-- NO se tocan (necesarias por diseño, romperían la app):
-- • current_tenant_id() / is_superadmin(): las políticas RLS las llaman
--   en cada consulta de 'authenticated'; revocar el EXECUTE tumbaría
--   todas las tablas con RLS.
-- • buscar_talleres(q): se usa desde el login ANTES de autenticarse
--   (loginBuscarTaller → cliente busca su comercio), necesita 'anon'.
-- ═══════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.registrar_taller(text, text, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.verificar_licencia(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.award_afiliacion() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fb_apply_puntos() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fb_match_cliente() FROM anon, authenticated, public;
