-- Foto "de catálogo" de cada modelo de vehículo (2026-09-22).
--
-- Henry: «en serio no pudiste conseguir una mejor foto.. hay muchas fotos de
-- brochures de esos vehiculos». La de Wikimedia es una foto de la calle. La
-- buena es la de estudio que el fabricante publica en la página del modelo o
-- en su sala de prensa (la imagen og:image de esa página). La Edge Function
-- foto-modelo la encuentra UNA vez por marca/modelo/año/color, la valida, la
-- guarda en Storage (para no depender de un enlace ajeno) y la deja acá.
--
-- Es GLOBAL, no por tenant: la foto de un Kia Picanto 2019 rojo es la misma
-- para todos los talleres. Por eso los usuarios solo LEEN; escribe únicamente
-- la función, con la llave de servicio.

create table if not exists public.fotos_modelo (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,          -- 'kia|picanto|2019|red' normalizado
  marca text not null,
  modelo text not null,
  anio int,
  color text,
  url text not null,                   -- URL pública en Storage (bucket fotos-modelo)
  pagina text,                         -- de qué página oficial salió
  created_at timestamptz not null default now(),
  check (anio is null or anio between 1950 and 2200),
  check (url ~ '^https://')
);

alter table public.fotos_modelo enable row level security;

revoke all on public.fotos_modelo from anon;
grant select on public.fotos_modelo to authenticated;

drop policy if exists fotos_modelo_leer on public.fotos_modelo;
create policy fotos_modelo_leer on public.fotos_modelo for select to authenticated using (true);

comment on table public.fotos_modelo is
  'Foto de catálogo por marca/modelo/año/color, compartida por todos los talleres. La escribe solo la Edge Function foto-modelo (service role).';

-- Bucket público de solo imágenes, 5 MB máximo por archivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-modelo', 'fotos-modelo', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
