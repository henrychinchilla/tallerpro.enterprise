-- ═══════════════════════════════════════════════════════════════
-- TallerPro Enterprise — Migración 007
-- Vincular líneas de OT y de factura a inventario (descuento de stock)
--
-- APLICADA EN PRODUCCIÓN: 2026-06-07 (link_items_inventario)
--
-- Permite que, al vender un repuesto en la factura, el stock del artículo
-- de inventario baje automáticamente. Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.ot_items     add column if not exists inventario_id uuid references public.inventario(id) on delete set null;
alter table public.factura_items add column if not exists inventario_id uuid references public.inventario(id) on delete set null;
comment on column public.ot_items.inventario_id     is 'Si es un repuesto de inventario, su id (para descontar stock al facturar)';
comment on column public.factura_items.inventario_id is 'Artículo de inventario vendido en esta línea (descuenta stock al emitir)';
