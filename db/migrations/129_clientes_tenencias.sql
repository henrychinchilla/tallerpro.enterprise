-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 129
-- Las TENENCIAS del cliente: una tarjeta por arma.
--
-- La app permitía subir la LICENCIA (que es del titular) pero no las
-- TENENCIAS, y son documentos distintos:
--
--   · LICENCIA de portación → del TITULAR. Autoriza llevar el arma consigo.
--     Vence, y hay que renovarla.
--   · TARJETA DE TENENCIA → de CADA ARMA. La emite DIGECAM con la huella
--     balística y el marcaje GUA. Dice "CIVIL ART. 9" y NO VENCE.
--
-- POR QUÉ IMPORTA PARA LA MUNICIÓN, que es lo que lo hace urgente: el tope
-- del artículo 60 en portación es de 250 cartuchos POR ARMA REGISTRADA, hasta
-- 3 armas (art. 72). Hasta hoy ese número se tecleaba a mano en cada entrega,
-- sin nada que lo respaldara. Con las tenencias registradas el número SALE DE
-- LOS DOCUMENTOS: se cuentan las tarjetas vigentes del cliente.
--
-- La estructura sale de dos tarjetas reales (una de 2019 en papel y una de
-- 2024 electrónica): número de tarjeta, huella balística, marcaje GUA de tres
-- números, No. de propietario, y los datos del arma con el cañón en MILÍMETROS.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.cliente_tenencias (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,

  -- Datos de la tarjeta
  num_tarjeta       text,          -- el "No." grande de la tarjeta
  huella_balistica  text,
  no_propietario    text,          -- el id que DIGECAM da al titular; se repite entre sus tarjetas
  marcaje_gua       text,          -- los tres números del troquelado (art. 35)
  fecha_emision     date,
  -- NO hay fecha_vencimiento a propósito: la tarjeta de tenencia no vence.

  -- Datos del arma
  tipo          text,              -- pistola, revólver, escopeta, rifle...
  marca         text,
  modelo        text,
  calibre       text,
  numero_serie  text,
  largo_canon_mm  numeric,         -- EN MILÍMETROS, como lo anota la tarjeta
  conversiones  text,
  pais_origen   text,

  -- Estado: un arma vendida o extraviada ya no cuenta para el tope de munición
  activa      boolean not null default true,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- El número de serie no se repite dentro del mismo comercio: dos tarjetas con
-- la misma serie es un error de captura, y contaría el arma dos veces para el
-- tope de munición. Parcial porque la serie puede faltar al capturar a medias.
create unique index if not exists uq_tenencia_serie
  on public.cliente_tenencias (tenant_id, numero_serie)
  where numero_serie is not null and numero_serie <> '';

create index if not exists idx_tenencias_tenant  on public.cliente_tenencias(tenant_id);
create index if not exists idx_tenencias_cliente on public.cliente_tenencias(cliente_id);
create index if not exists idx_tenencias_activa  on public.cliente_tenencias(cliente_id, activa);

comment on table public.cliente_tenencias is
  'Tarjetas de tenencia (una por arma) de los clientes. Sustentan el número de armas registradas que multiplica el tope de munición del art. 60. NO llevan vencimiento: la tarjeta de tenencia no vence.';
comment on column public.cliente_tenencias.largo_canon_mm is
  'En MILÍMETROS, como lo anota DIGECAM (ej. pistola 102, escopeta 530). No convertir a pulgadas.';
comment on column public.cliente_tenencias.marcaje_gua is
  'Los tres números de la línea MARCAJE GUA: el troquelado del art. 35.';
comment on column public.cliente_tenencias.activa is
  'false cuando el arma se vendió, se extravió o la tarjeta se anuló. Las inactivas no cuentan para el tope de munición.';

grant select, insert, update, delete on public.cliente_tenencias to authenticated;

alter table public.cliente_tenencias enable row level security;

drop policy if exists cliente_tenencias_tenant on public.cliente_tenencias;
create policy cliente_tenencias_tenant on public.cliente_tenencias
  for all to authenticated
  using (tenant_id = current_tenant_id() or is_superadmin())
  with check (tenant_id = current_tenant_id() or is_superadmin());

-- ── Las armas registradas se CUENTAN, no se teclean ─────────────────────
-- El art. 72 topa en 3, así que el conteo se recorta ahí: registrar una cuarta
-- tarjeta no debe subir el tope de munición por encima de lo que la ley permite.
create or replace function public.armas_registradas_cliente(p_cliente uuid)
returns integer
language sql stable
set search_path to 'public'
as $$
  select least(3, count(*)::int)
  from public.cliente_tenencias
  where cliente_id = p_cliente and activa;
$$;
