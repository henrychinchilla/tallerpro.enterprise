-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 006
-- Desglose de factura: una línea por ítem cobrado (factura_items)
--
-- APLICADA EN PRODUCCIÓN: 2026-06-07 (factura_items_desglose)
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.factura_items (
  id          uuid default gen_random_uuid() primary key,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  factura_id  uuid references public.facturas(id) on delete cascade,
  descripcion text,
  cantidad    numeric default 1,
  precio_unit numeric default 0,
  total       numeric default 0,
  created_at  timestamptz default now()
);
create index if not exists idx_factura_items_factura on public.factura_items(factura_id);

alter table public.factura_items enable row level security;
drop policy if exists "tenant_isolation" on public.factura_items;
create policy "tenant_isolation" on public.factura_items
  for all to authenticated
  using      (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());

grant all on public.factura_items to authenticated;
revoke all on public.factura_items from anon;
