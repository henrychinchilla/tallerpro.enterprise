-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 105
-- Precios de insumos para costear fórmulas de alimentación
--
-- Las fórmulas (bovinos, porcinos, aves, equinos) se costean con el precio
-- diario del MAGA para maíz, sorgo (maicillo) y soya — los tres que el MAGA
-- SÍ publica. El resto de ingredientes (melaza, salvado de trigo, carbonato
-- de calcio, fosfato dicálcico, sal, premezcla, metionina, lisina, aceite,
-- harina de pescado, avena, urea) NO los publica nadie de forma abierta, así
-- que los pone cada comercio con lo que le cuestan a él.
--
-- Por eso esta tabla es por tenant y no un catálogo nuestro: el precio de la
-- melaza en Escuintla no es el de Quetzaltenango, y un número inventado en el
-- costo de una fórmula es peor que no dar el costo.
--
-- `precio_quintal` porque es como se compra y como publica el MAGA; la UI
-- convierte a kg cuando toca.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.agro_insumos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  nombre         text not null,
  precio_quintal numeric(12,2) not null check (precio_quintal >= 0),
  nota           text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (tenant_id, nombre)
);

create index if not exists idx_agro_insumos_tenant on public.agro_insumos(tenant_id);

alter table public.agro_insumos enable row level security;

drop policy if exists "agro_insumos_tenant" on public.agro_insumos;
create policy "agro_insumos_tenant" on public.agro_insumos
  for all to authenticated
  using      (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());

-- Los CUATRO privilegios: el módulo tiene Crear, Ver, Editar y Eliminar, y el
-- guardado usa upsert — que exige INSERT *y* UPDATE (ver migración 100).
-- A propósito sin TRUNCATE: no está sujeto a RLS.
grant select, insert, update, delete on public.agro_insumos to authenticated;
revoke all on public.agro_insumos from anon;
