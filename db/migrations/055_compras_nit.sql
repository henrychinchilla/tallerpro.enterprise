-- ═══════════════════════════════════════════════════════
-- 055 — NIT del proveedor en compras (visible en Libro de Compras)
-- Backfill desde fel_importados.nit_emisor (para recibidas = NIT del proveedor,
-- que se capturó correctamente; el bug del NIT solo afectó a ventas/emitidas).
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS nit_proveedor text;

UPDATE public.compras c
SET nit_proveedor = f.nit_emisor
FROM public.fel_importados f
WHERE c.fel_importado_id = f.id AND c.nit_proveedor IS NULL;
