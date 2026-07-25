-- 082 — Acceso POS explícito por taller y terminal.
-- Google autentica a la persona; esta migración define a qué taller y POS puede entrar.

CREATE TABLE IF NOT EXISTS public.usuario_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rol text NOT NULL DEFAULT 'vendedor',
  permisos_custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuario_tenants_unico UNIQUE (usuario_id, tenant_id)
);

-- Todos los usuarios existentes conservan inmediatamente su taller actual.
INSERT INTO public.usuario_tenants (usuario_id, tenant_id, rol, permisos_custom, activo)
SELECT id, tenant_id, coalesce(rol, 'vendedor'), coalesce(permisos_custom, '{}'::jsonb), coalesce(activo, true)
FROM public.usuarios
WHERE tenant_id IS NOT NULL
ON CONFLICT (usuario_id, tenant_id) DO UPDATE SET
  rol = EXCLUDED.rol,
  permisos_custom = EXCLUDED.permisos_custom,
  activo = EXCLUDED.activo,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.pos_terminales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  codigo text,
  activo boolean NOT NULL DEFAULT true,
  es_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_terminales_nombre_unico UNIQUE (tenant_id, nombre),
  CONSTRAINT pos_terminales_codigo_unico UNIQUE (tenant_id, codigo)
);

-- Cada taller parte con una terminal clara y puede añadir más después.
INSERT INTO public.pos_terminales (tenant_id, nombre, codigo, es_principal)
SELECT t.id, 'POS principal', 'POS-PRINCIPAL', true
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.pos_terminales p WHERE p.tenant_id = t.id
);

ALTER TABLE public.cajas_pos
  ADD COLUMN IF NOT EXISTS terminal_id uuid REFERENCES public.pos_terminales(id);

UPDATE public.cajas_pos c
SET terminal_id = p.id
FROM public.pos_terminales p
WHERE p.tenant_id = c.tenant_id
  AND p.es_principal = true
  AND c.terminal_id IS NULL;

ALTER TABLE public.cajas_pos
  ALTER COLUMN terminal_id SET NOT NULL;

DROP INDEX IF EXISTS public.cajas_pos_una_abierta_por_tenant_idx;
CREATE UNIQUE INDEX IF NOT EXISTS cajas_pos_una_abierta_por_terminal_idx
  ON public.cajas_pos (terminal_id) WHERE estado = 'abierta';
CREATE INDEX IF NOT EXISTS cajas_pos_terminal_fecha_idx
  ON public.cajas_pos (terminal_id, abierta_at DESC);

ALTER TABLE public.usuario_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usuario_tenants_usuario_propio ON public.usuario_tenants;
CREATE POLICY usuario_tenants_usuario_propio ON public.usuario_tenants FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.is_superadmin());

ALTER TABLE public.pos_terminales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_terminales_tenant_isolation ON public.pos_terminales;
CREATE POLICY pos_terminales_tenant_isolation ON public.pos_terminales FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());

-- Solo devuelve talleres ya asignados al usuario autenticado.
CREATE OR REPLACE FUNCTION public.mis_talleres_pos()
RETURNS TABLE (tenant_id uuid, tenant_nombre text, rol text, permisos_custom jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT ut.tenant_id, t.name, ut.rol, ut.permisos_custom
  FROM public.usuario_tenants ut
  JOIN public.tenants t ON t.id = ut.tenant_id
  WHERE ut.usuario_id = auth.uid() AND ut.activo = true
  ORDER BY t.name
$fn$;

-- Cambia el contexto activo solamente si el usuario pertenece al taller elegido.
CREATE OR REPLACE FUNCTION public.seleccionar_taller_pos(p_tenant_id uuid)
RETURNS TABLE (tenant_id uuid, rol text, permisos_custom jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_membresia public.usuario_tenants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_membresia
  FROM public.usuario_tenants
  WHERE usuario_id = auth.uid() AND tenant_id = p_tenant_id AND activo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tienes acceso a este taller';
  END IF;

  UPDATE public.usuarios
  SET tenant_id = v_membresia.tenant_id,
      rol = v_membresia.rol,
      permisos_custom = v_membresia.permisos_custom,
      ultimo_login = now()
  WHERE id = auth.uid();

  RETURN QUERY SELECT v_membresia.tenant_id, v_membresia.rol, v_membresia.permisos_custom;
END
$fn$;

REVOKE ALL ON FUNCTION public.mis_talleres_pos() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seleccionar_taller_pos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_talleres_pos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seleccionar_taller_pos(uuid) TO authenticated;
GRANT SELECT ON public.usuario_tenants, public.pos_terminales TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pos_terminales TO authenticated;
GRANT ALL ON public.usuario_tenants, public.pos_terminales TO service_role;
