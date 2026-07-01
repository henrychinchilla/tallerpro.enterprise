-- ═══════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 062
-- Corrige recursión infinita en is_superadmin()
-- ═══════════════════════════════════════════════════════
-- is_superadmin() leía public.usuarios SIN SECURITY DEFINER, así que esa
-- lectura disparaba la RLS de usuarios (política usuarios_tenant incluye
-- "OR is_superadmin()"), que volvía a llamar is_superadmin() → recursión
-- infinita (stack depth exceeded). Efecto: cualquier SELECT sobre tenants
-- que tuviera que evaluar is_superadmin() para una fila que no es el
-- propio tenant fallaba, y el Panel SaaS mostraba 0 comercios en cuanto
-- existía más de un tenant.
--
-- Fix: SECURITY DEFINER (igual que current_tenant_id()), para que la
-- lectura interna de usuarios NO vuelva a evaluar RLS. La función solo
-- devuelve un boolean sobre el usuario actual (auth.uid()/JWT), no expone
-- datos de otros usuarios.
CREATE OR REPLACE FUNCTION public.is_superadmin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select rol = 'superadmin' from public.usuarios where id = auth.uid()), false)
         or coalesce(auth.jwt() ->> 'email', '') = 'henry.chinchilla@gmail.com'
$function$;
