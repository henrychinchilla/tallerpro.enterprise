-- ═══════════════════════════════════════════════════════
-- 063 — Solicitudes de comercio (auto-registro con verificación de correo)
--
-- Flujo nuevo de alta pública:
--   1. El visitante llena el formulario → se crea una SOLICITUD
--      (estado 'pendiente_verificacion') y un usuario auth SIN confirmar.
--      TODAVÍA NO existe el comercio (tenant).
--   2. Se le envía un correo de verificación (Edge: registrar-taller).
--   3. Al abrir el link (Edge: verificar-registro) se confirma el correo y
--      RECIÉN AHÍ se crea el tenant suspendido (estado 'verificado' = espera
--      aprobación del superadmin).
--   4. Si nunca verifica → la solicitud queda 'pendiente_verificacion' y un
--      job la marca 'expirado' (no se crea comercio).
--   5. Máx. 3 solicitudes por correo (excluyendo las expiradas).
--   6. Aprobar (Edge: aprobar-comercio) → tenant activo + correo al cliente.
--   7. Rechazar (Edge: rechazar-comercio) → se borra el tenant pero la
--      solicitud queda 'rechazado' para identificar spam.
--
-- RLS: solo superadmin desde el cliente; las Edge Functions usan service_role.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.solicitudes_comercio (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  nombre_comercio  text NOT NULL,
  nombre_admin     text NOT NULL,
  nit              text,
  telefono         text,
  tipo_negocio     text,
  modulos_activos  jsonb,
  auth_user_id     uuid,          -- usuario auth creado (sin confirmar hasta verificar)
  tenant_id        uuid,          -- comercio materializado tras verificar el correo
  token            text,          -- token de verificación de correo
  token_expira     timestamptz,
  estado           text NOT NULL DEFAULT 'pendiente_verificacion'
    CHECK (estado = ANY (ARRAY['pendiente_verificacion','verificado','aprobado','rechazado','expirado'])),
  verificado_at    timestamptz,
  aprobado_at      timestamptz,
  rechazado_at     timestamptz,
  motivo_rechazo   text,
  ip               text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.solicitudes_comercio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_only ON public.solicitudes_comercio;
CREATE POLICY sa_only ON public.solicitudes_comercio FOR ALL
  USING (is_superadmin()) WITH CHECK (is_superadmin());

CREATE INDEX IF NOT EXISTS solicitudes_email_idx  ON public.solicitudes_comercio (lower(email));
CREATE INDEX IF NOT EXISTS solicitudes_token_idx  ON public.solicitudes_comercio (token);
CREATE INDEX IF NOT EXISTS solicitudes_estado_idx ON public.solicitudes_comercio (estado, created_at DESC);
