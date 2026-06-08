-- ═══════════════════════════════════════════════════════
-- 009 — Correcciones: facturas (CF), permisos de usuario y
--       deduplicación de proveedores.
-- Aplicada vía MCP el 2026-06-08 (migración registrada para historial).
-- ═══════════════════════════════════════════════════════

-- 1) Facturas: permitir Consumidor Final sin cliente registrado
ALTER TABLE public.facturas ALTER COLUMN cliente_id DROP NOT NULL;

-- 2) Usuarios: columna de permisos personalizados (el editor de usuarios ya la usa)
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS permisos_custom jsonb;

-- 3) Proveedores: repuntar la FK de inventario al proveedor que se conserva (el más antiguo)
UPDATE public.inventario i SET proveedor_id = sub.keep_id
FROM (
  SELECT id,
         first_value(id) OVER (PARTITION BY tenant_id, lower(trim(nombre)) ORDER BY created_at) AS keep_id
  FROM public.proveedores
) sub
WHERE i.proveedor_id = sub.id AND sub.id <> sub.keep_id;

-- 4) Eliminar proveedores duplicados (conservando el más antiguo por nombre+tenant)
DELETE FROM public.proveedores p
USING (
  SELECT id,
         row_number() OVER (PARTITION BY tenant_id, lower(trim(nombre)) ORDER BY created_at) AS rn
  FROM public.proveedores
) sub
WHERE p.id = sub.id AND sub.rn > 1;

-- 5) Evitar que se vuelvan a duplicar (por taller, sin distinguir mayúsculas)
CREATE UNIQUE INDEX IF NOT EXISTS proveedores_tenant_nombre_uniq
  ON public.proveedores (tenant_id, lower(trim(nombre)));
