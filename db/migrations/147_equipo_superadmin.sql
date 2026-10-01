-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 147
-- Equipo del Panel SaaS: colaboradores con rol superadmin
-- ═══════════════════════════════════════════════════════
-- 1) is_superadmin() exige que el colaborador siga ACTIVO: inactivar a
--    alguien del equipo le quita el poder en RLS, no solo en la pantalla.
--    El dueño (por correo) no depende de su fila.
--
-- 2) Cierra una escalada: la política usuarios_tenant deja a cualquier
--    usuario de un comercio actualizar filas de SU tenant, incluida la
--    suya. Sin este trigger un admin de comercio podía hacerse
--    rol='superadmin' con un UPDATE directo y ver todos los comercios.
--    Ahora, solo un superadmin (o el service role, que es como crea la
--    Edge Function crear-usuario) puede dar, quitar o tocar ese rol, y la
--    fila del dueño solo la toca el dueño.

CREATE OR REPLACE FUNCTION public.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select rol = 'superadmin' and activo is not false
                     from public.usuarios where id = auth.uid()), false)
         or coalesce(auth.jwt() ->> 'email', '') = 'henry.chinchilla@gmail.com'
$function$;

CREATE OR REPLACE FUNCTION public.fn_guard_rol_superadmin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  dueno constant text := 'henry.chinchilla@gmail.com';
  es_dueno boolean := coalesce(auth.jwt() ->> 'email', '') = dueno;
begin
  -- Sin usuario autenticado = service role o SQL de mantenimiento.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.rol = 'superadmin' and not public.is_superadmin() then
      raise exception 'Solo un superadministrador puede crear superadministradores' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.rol = 'superadmin' or old.rol = 'superadmin') and not public.is_superadmin() then
    raise exception 'Solo un superadministrador puede modificar a un superadministrador' using errcode = '42501';
  end if;

  if old.email = dueno and not es_dueno
     and (new.rol is distinct from old.rol or new.activo is distinct from old.activo
          or new.email is distinct from old.email or new.tenant_id is distinct from old.tenant_id) then
    raise exception 'La cuenta del dueño solo la puede cambiar el dueño' using errcode = '42501';
  end if;

  return new;
end
$function$;

DROP TRIGGER IF EXISTS trg_guard_rol_superadmin ON public.usuarios;
CREATE TRIGGER trg_guard_rol_superadmin
  BEFORE INSERT OR UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_rol_superadmin();

-- El DELETE va por la Edge Function eliminar-usuario (service role), que
-- ya valida. Por API directa, que nadie que no sea superadmin borre a uno.
CREATE OR REPLACE FUNCTION public.fn_guard_borrar_superadmin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and (old.rol = 'superadmin' or old.email = 'henry.chinchilla@gmail.com')
     and not (public.is_superadmin() and old.email <> 'henry.chinchilla@gmail.com') then
    raise exception 'No se puede eliminar a este superadministrador' using errcode = '42501';
  end if;
  return old;
end
$function$;

DROP TRIGGER IF EXISTS trg_guard_borrar_superadmin ON public.usuarios;
CREATE TRIGGER trg_guard_borrar_superadmin
  BEFORE DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_borrar_superadmin();
