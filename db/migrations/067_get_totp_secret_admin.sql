-- ═══════════════════════════════════════════════════════
-- 067 — RPC para verificar 2FA de administradores en el borrado de BD
--
-- Devuelve el secreto TOTP (base32) del factor 2FA verificado de un
-- administrador de un tenant. La usa la Edge Function verificar-borrado-2fa
-- (service_role) para validar, EN EL SERVIDOR, el código de Google
-- Authenticator de cada uno de los 2 administradores que autorizan el borrado.
--
-- SOLO service_role puede ejecutarla (nunca el cliente): el secreto jamás
-- sale al navegador; solo se usa dentro de la Edge Function para verificar.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_totp_secret_for_admin(p_email text, p_tenant uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.secret
  FROM auth.mfa_factors f
  JOIN public.usuarios u ON u.id = f.user_id
  WHERE lower(u.email) = lower(p_email)
    AND u.tenant_id = p_tenant
    AND u.activo = true
    AND u.rol IN ('admin','gerente_tal','superadmin')
    AND f.factor_type = 'totp'
    AND f.status = 'verified'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_totp_secret_for_admin(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_totp_secret_for_admin(text, uuid) TO service_role;
