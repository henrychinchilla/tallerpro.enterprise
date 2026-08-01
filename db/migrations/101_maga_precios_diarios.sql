-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 101
-- Precios DIARIOS del MAGA (mercados mayoristas)
--
-- Hasta hoy sólo se traía el CSV MENSUAL (cron día 8). El MAGA además publica
-- un archivo por día con los precios de La Terminal y el CENMA — ~186 lecturas
-- diarias — que la página de datos abiertos carga por AJAX desde
--   POST https://precios.maga.gob.gt/diarios/dadindividuales.php
--   → https://precios.maga.gob.gt/diarios/individuales/<archivo>.json
-- Ese es el insumo para avisar oportunidades de compra/venta del día.
--
-- POR QUÉ TABLA APARTE y no dentro de maga_precios:
-- la serie mensual es la que alimenta la estacionalidad y las ventanas de
-- compra ya desplegadas, y su índice único es (producto_id, mercado, fecha).
-- Meter ahí filas diarias colisionaría justo el día 1 de cada mes con la fila
-- mensual y ensuciaría los promedios de una función que hoy funciona. Separar
-- cuesta una tabla y no arriesga nada de lo que ya sirve.
--
-- Comparte el catálogo `maga_productos` (mismo par nombre+medida), así que un
-- producto seguido en la vista mensual es el mismo de la diaria.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.maga_precios_diarios (
  id          bigserial primary key,
  producto_id bigint      not null references public.maga_productos(id) on delete cascade,
  mercado     text        not null,
  fecha       date        not null,
  precio      numeric(12,2) not null,
  precio_kg   numeric(12,4),
  actor       text,                       -- "Mayorista" (lo que publica el MAGA hoy)
  created_at  timestamptz default now(),
  unique (producto_id, mercado, fecha)
);

create index if not exists idx_maga_diarios_fecha    on public.maga_precios_diarios(fecha desc);
create index if not exists idx_maga_diarios_producto on public.maga_precios_diarios(producto_id, fecha desc);

-- Precios públicos de referencia: NO llevan tenant_id. Se leen igual que
-- maga_precios (misma política que la migración 085) y sólo los escribe la
-- Edge Function con service_role, que no está sujeta a RLS.
alter table public.maga_precios_diarios enable row level security;

drop policy if exists "maga_diarios_lectura" on public.maga_precios_diarios;
create policy "maga_diarios_lectura" on public.maga_precios_diarios
  for select to authenticated using (true);

-- Sólo SELECT: nadie con sesión debe poder alterar una referencia de precios.
grant select on public.maga_precios_diarios to authenticated;
revoke all on public.maga_precios_diarios from anon;
