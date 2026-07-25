-- 083 — Mantiene actualizada la asignación de talleres al crear o editar usuarios.
CREATE OR REPLACE FUNCTION public.sincronizar_membresia_usuario()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.usuario_tenants (usuario_id, tenant_id, rol, permisos_custom, activo)
    VALUES (NEW.id, NEW.tenant_id, coalesce(NEW.rol, 'vendedor'),
            coalesce(NEW.permisos_custom, '{}'::jsonb), coalesce(NEW.activo, true))
    ON CONFLICT (usuario_id, tenant_id) DO UPDATE SET
      rol = EXCLUDED.rol,
      permisos_custom = EXCLUDED.permisos_custom,
      activo = EXCLUDED.activo,
      updated_at = now();
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS usuarios_sincronizar_membresia ON public.usuarios;
CREATE TRIGGER usuarios_sincronizar_membresia
  AFTER INSERT OR UPDATE OF tenant_id, rol, permisos_custom, activo ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_membresia_usuario();

REVOKE ALL ON FUNCTION public.sincronizar_membresia_usuario() FROM PUBLIC;
