-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 150
-- Equipo SaaS: mínimo privilegio en la gestión del equipo
-- ═══════════════════════════════════════════════════════
-- El rol SaaS (permisos_custom.saas_rol: total/soporte/cobros) solo recortaba
-- la PANTALLA: un "Soporte" podía, por API, cambiarse a "total" o dar de alta
-- superadmins. Ahora la gestión del equipo exige ser el dueño o un
-- superadmin con saas_rol = 'total'. Sin saas_rol = 'soporte' (mínimo).
--
-- Un superadmin sigue pudiendo tocar SU propia fila en campos inocuos
-- (ultimo_login, debe_cambiar_password, nombre…): lo que se protege es
-- rol, activo, permisos_custom, email y tenant_id.

CREATE OR REPLACE FUNCTION public.is_superadmin_total()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(auth.jwt() ->> 'email', '') = 'henry.chinchilla@gmail.com'
      or coalesce((select rol = 'superadmin' and activo is not false
                          and coalesce(permisos_custom ->> 'saas_rol', 'soporte') = 'total'
                     from public.usuarios where id = auth.uid()), false)
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
  sensible boolean;
begin
  -- Sin usuario autenticado = service role o SQL de mantenimiento.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.rol = 'superadmin' and not public.is_superadmin_total() then
      raise exception 'Solo un superadministrador total puede crear superadministradores' using errcode = '42501';
    end if;
    return new;
  end if;

  sensible := new.rol is distinct from old.rol or new.activo is distinct from old.activo
           or new.permisos_custom is distinct from old.permisos_custom
           or new.email is distinct from old.email or new.tenant_id is distinct from old.tenant_id;

  if (new.rol = 'superadmin' or old.rol = 'superadmin') then
    if not public.is_superadmin() then
      raise exception 'Solo un superadministrador puede modificar a un superadministrador' using errcode = '42501';
    end if;
    if sensible and not public.is_superadmin_total() then
      raise exception 'Solo un superadministrador total puede cambiar rol, permisos o acceso del equipo SaaS' using errcode = '42501';
    end if;
  end if;

  if old.email = dueno and not es_dueno and sensible then
    raise exception 'La cuenta del dueño solo la puede cambiar el dueño' using errcode = '42501';
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.fn_guard_borrar_superadmin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and (old.rol = 'superadmin' or old.email = 'henry.chinchilla@gmail.com')
     and not (public.is_superadmin_total() and old.email <> 'henry.chinchilla@gmail.com') then
    raise exception 'No se puede eliminar a este superadministrador' using errcode = '42501';
  end if;
  return old;
end
$function$;

REVOKE ALL ON FUNCTION public.is_superadmin_total() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin_total() TO authenticated, service_role;
