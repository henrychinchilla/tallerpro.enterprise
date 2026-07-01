-- ═══════════════════════════════════════════════════════
-- 066 — Arreglar handle_new_user(): no crear perfiles huérfanos
--
-- El trigger on_auth_user_created creaba SIEMPRE una fila en public.usuarios
-- al crear la cuenta Auth, tomando tenant_id del metadata (o NULL si no venía).
-- Como los flujos de registro (registrar-taller, verificar-registro,
-- registrar-comercio-google, crear-usuario) crean la cuenta Auth ANTES de
-- conocer/ligar el tenant, el trigger dejaba un perfil con tenant_id = NULL
-- que luego chocaba con el INSERT explícito del perfil correcto → el perfil
-- no quedaba ligado al comercio y el registro quedaba a medias.
--
-- Solución: el trigger SOLO crea el perfil si viene tenant_id en el metadata.
-- Si no viene, el flujo que corresponda insertará/actualizará el perfil
-- (upsert), evitando perfiles huérfanos y conflictos.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo autocrear el perfil cuando el tenant viene explícito en el metadata.
  IF (NEW.raw_user_meta_data ? 'tenant_id')
     AND NULLIF(NEW.raw_user_meta_data->>'tenant_id','') IS NOT NULL THEN
    INSERT INTO public.usuarios (id, email, nombre, rol, activo, tenant_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'nombre',
               NEW.raw_user_meta_data->>'full_name',
               split_part(NEW.email,'@',1)),
      COALESCE(NEW.raw_user_meta_data->>'rol', 'recepcionista'),
      true,
      (NEW.raw_user_meta_data->>'tenant_id')::uuid
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
