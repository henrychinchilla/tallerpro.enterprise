-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 134
-- Fórmulas de alimento PROPIAS del comercio, para cualquier animal
--
-- Hasta hoy las fórmulas eran una constante en el código: aves, cerdos,
-- bovinos y equinos, y nada más. Un agroservicio real formula también para
-- conejos, tilapia, ovejas, patos, codornices o perros — y sobre todo AJUSTA
-- la fórmula de referencia a lo que él mezcla. Sin esta tabla, la pantalla
-- servía para mirar, no para trabajar.
--
-- `ingredientes` es un jsonb [{nombre, pct}] y no una tabla hija a propósito:
-- una fórmula se guarda y se lee SIEMPRE entera (nadie consulta "los renglones
-- de melaza de todas las fórmulas"), y el nombre del ingrediente es la misma
-- llave con la que ya se busca el precio en agro_insumos y en el catálogo del
-- MAGA. Así el costeo no necesita saber si la fórmula es de referencia o
-- propia: pregunta por nombre y listo.
--
-- `consumo` es el consumo diario POR ANIMAL en kg, igual que en las fórmulas
-- de referencia, que es de donde sale "un quintal alimenta N animales".
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.agro_formulas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  -- Grupo con el que se agrupa en pestañas. Puede ser uno de los de referencia
  -- (aves, porcinos, bovinos, equinos) o uno inventado por el comercio.
  especie       text not null,
  -- Cómo se muestra esa pestaña. Nullable: si la especie es una de las de
  -- referencia, la etiqueta ya existe en el código.
  especie_label text,
  nombre        text not null,
  animal        text not null,
  consumo       numeric(10,4) not null check (consumo > 0),
  ingredientes  jsonb not null default '[]'::jsonb,
  nota          text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (tenant_id, nombre)
);

comment on column public.agro_formulas.ingredientes is
  'Array [{nombre, pct}]. `nombre` es la etiqueta del ingrediente: se busca por ese nombre en agro_insumos (precio propio) y en el catálogo del MAGA.';
comment on column public.agro_formulas.consumo is
  'Consumo diario por animal, en kg. De ahí sale a cuántos animales le alcanza un quintal.';

create index if not exists idx_agro_formulas_tenant on public.agro_formulas(tenant_id, especie);

alter table public.agro_formulas enable row level security;

drop policy if exists "agro_formulas_tenant" on public.agro_formulas;
create policy "agro_formulas_tenant" on public.agro_formulas
  for all to authenticated
  using      (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());

-- Los CUATRO privilegios: el módulo tiene Crear, Ver, Editar y Eliminar, y el
-- guardado usa upsert — que exige INSERT *y* UPDATE (ver migración 100).
-- A propósito sin TRUNCATE: no está sujeto a RLS.
grant select, insert, update, delete on public.agro_formulas to authenticated;
revoke all on public.agro_formulas from anon;
