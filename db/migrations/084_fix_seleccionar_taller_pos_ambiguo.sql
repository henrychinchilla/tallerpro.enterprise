-- 084 — Arregla seleccionar_taller_pos: "column reference tenant_id is ambiguous" (42702).
--
-- La 082 declaró RETURNS TABLE (tenant_id uuid, rol text, permisos_custom jsonb).
-- Esos nombres son variables plpgsql dentro del cuerpo, así que el
-- `WHERE ... tenant_id = p_tenant_id` sin calificar era ambiguo entre la variable
-- y usuario_tenants.tenant_id. Postgres abortaba con 42702, PostgREST devolvía 400
-- y el POS quedaba trabado en el selector de taller: nadie lograba entrar.
--
-- Se califica cada referencia con el alias de la tabla. Se mantiene idéntica la
-- semántica de seguridad: sólo cambia el taller activo si el usuario autenticado
-- tiene una membresía activa en él.

CREATE OR REPLACE FUNCTION public.seleccionar_taller_pos(p_tenant_id uuid)
RETURNS TABLE (tenant_id uuid, rol text, permisos_custom jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_membresia public.usuario_tenants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT ut.* INTO v_membresia
  FROM public.usuario_tenants AS ut
  WHERE ut.usuario_id = auth.uid()
    AND ut.tenant_id = p_tenant_id
    AND ut.activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes acceso a este taller';
  END IF;

  UPDATE public.usuarios AS u
  SET tenant_id       = v_membresia.tenant_id,
      rol             = v_membresia.rol,
      permisos_custom = v_membresia.permisos_custom,
      ultimo_login    = now()
  WHERE u.id = auth.uid();

  RETURN QUERY
    SELECT v_membresia.tenant_id, v_membresia.rol, v_membresia.permisos_custom;
END
$fn$;

REVOKE ALL ON FUNCTION public.seleccionar_taller_pos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seleccionar_taller_pos(uuid) TO authenticated;
