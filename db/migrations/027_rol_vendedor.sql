-- ═══════════════════════════════════════════════════════
-- 027 — Rol "vendedor" (Punto de Venta)
--   Nuevo perfil de usuario orientado al POS. Se agrega a los
--   CHECK de usuarios.rol y empleados.rol.
-- Aplicada vía MCP el 2026-06-09 (nombre original: rol_vendedor).
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol = ANY (ARRAY['superadmin','admin','gerente_fin','gerente_tal','recepcionista','mecanico','vendedor','cliente']));

ALTER TABLE public.empleados DROP CONSTRAINT IF EXISTS empleados_rol_check;
ALTER TABLE public.empleados ADD CONSTRAINT empleados_rol_check
  CHECK (rol = ANY (ARRAY['superadmin','admin','gerente_fin','gerente_tal','recepcionista','mecanico','vendedor','cliente','otro']));
