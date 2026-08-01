-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 106
-- Precios de MENUDEO del mercado guatemalteco (supermercados)
--
-- El MAGA da el precio MAYORISTA (quintal, La Terminal y CENMA). Lo que
-- faltaba era el otro lado: a cuánto se vende al público. Varias cadenas
-- guatemaltecas corren su tienda en línea sobre VTEX, que expone un endpoint
-- PÚBLICO y sin autenticación —el mismo que usa su propio sitio para pintar
-- el catálogo—:
--   GET /api/catalog_system/pub/products/search?ft=<termino>
-- De ahí salen nombre, marca, presentación y precio.
--
-- POR QUÉ IMPORTA NORMALIZAR: el menudeo se vende por bolsa ("Frijol negro
-- 2000 g") y el mayoreo por quintal. Comparar Q38 contra Q525 no dice nada.
-- El peso viene dentro del nombre, así que se extrae y se guarda `precio_kg`:
-- recién ahí Q19.00/kg de góndola se puede poner al lado de Q11.57/kg de
-- La Terminal y ver el margen real.
--
-- `precio_kg` es NULL cuando el nombre no dice peso (un paquete "x12
-- unidades", por ejemplo). Se guarda igual el precio de lista, pero no se
-- compara: mejor un dato incompleto y marcado que una equivalencia inventada.
--
-- Es referencia pública igual que maga_precios: sin tenant_id, lectura para
-- cualquier usuario con sesión y escritura sólo de la Edge Function.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.mercado_precios (
  id          bigserial primary key,
  fuente      text not null,              -- 'walmart.com.gt', 'latorre.com.gt'
  termino     text not null,              -- qué se buscó ('frijol negro')
  nombre      text not null,
  marca       text,
  precio      numeric(12,2) not null,
  gramos      numeric(12,2),              -- peso interpretado del nombre
  precio_kg   numeric(12,4),              -- NULL si no se pudo interpretar
  url         text,
  fecha       date not null,
  created_at  timestamptz default now(),
  unique (fuente, nombre, fecha)
);

create index if not exists idx_mercado_fecha   on public.mercado_precios(fecha desc);
create index if not exists idx_mercado_termino on public.mercado_precios(termino, fecha desc);

alter table public.mercado_precios enable row level security;

drop policy if exists "mercado_precios_lectura" on public.mercado_precios;
create policy "mercado_precios_lectura" on public.mercado_precios
  for select to authenticated using (true);

grant select on public.mercado_precios to authenticated;
revoke all on public.mercado_precios from anon;

-- ── Comparación menudeo vs mayoreo ─────────────────────────────
-- Junta las dos puntas por término de búsqueda. Devuelve sólo lo que tiene
-- las dos, porque media comparación no sirve para negociar.
drop function if exists public.mercado_vs_mayoreo(date);

create or replace function public.mercado_vs_mayoreo(p_fecha date default null)
returns table (
  termino        text,
  producto_maga  text,
  mayoreo_kg     numeric,
  menudeo_kg     numeric,
  menudeo_nombre text,
  fuente         text,
  margen_pct     numeric,
  fecha_menudeo  date,
  fecha_mayoreo  date
)
language sql
stable
security definer
set search_path = public
as $$
  with menudeo as (
    /* El más barato por kg de cada término, del último día con datos. */
    select distinct on (m.termino)
           m.termino, m.precio_kg, m.nombre, m.fuente, m.fecha
      from public.mercado_precios m
     where m.precio_kg is not null
       /* Sólo presentaciones de 1 kg para arriba: una bolsita de 400 g contra
          un quintal da margenes de 400% que no son margen, son empaque. */
       and m.gramos >= 900
       /* Y sólo producto CRUDO. "Harina Maíz 1000g" no es maíz en grano y
          "Frijol volteados" es refrito: compararlos contra el quintal daba
          margenes de 450% que no son margen, son transformación. El nombre no
          alcanza para distinguir grano de derivado, así que se excluyen los
          derivados por nombre y se acepta perder alguno antes que publicar una
          comparación falsa. */
       and translate(lower(m.nombre), 'áéíóúüñ', 'aeiouun') !~
           '\m(harina|harinas|volteado|volteados|refrito|refritos|molido|molida|tortilla|tostada|atol|snack|churro|fritura|cereal|hojuela|crema|dip|salsa|pure|bebida|instantane[oa])'
       and m.fecha = (select max(x.fecha) from public.mercado_precios x where x.termino = m.termino)
     order by m.termino, m.precio_kg asc
  ),
  mayoreo as (
    select distinct on (p.nombre)
           p.nombre, d.precio_kg, d.fecha
      from public.maga_precios_diarios d
      join public.maga_productos p on p.id = d.producto_id
     where d.precio_kg is not null
       and d.fecha = (select max(x.fecha) from public.maga_precios_diarios x)
     order by p.nombre, d.precio_kg asc
  )
  select me.termino,
         ma.nombre,
         round(ma.precio_kg, 2),
         round(me.precio_kg, 2),
         me.nombre,
         me.fuente,
         round((me.precio_kg - ma.precio_kg) / ma.precio_kg * 100, 1),
         me.fecha,
         ma.fecha
    from menudeo me
    /* El match va por PALABRA COMPLETA y sin acentos, no por LIKE:
       · con `like '%azucar%'`, el término "azucar" pegaba con
         "Naranja Piña (Azucarona)" y comparaba azúcar de góndola contra
         naranja al por mayor — un número que parecía dato y era basura.
       · sin quitar acentos, "maiz blanco" nunca encontraba "Maíz blanco",
         que es justo el producto que más importa acá. */
    join mayoreo ma
      on translate(lower(ma.nombre), 'áéíóúüñ', 'aeiouun')
         ~ ('\m' || translate(lower(me.termino), 'áéíóúüñ', 'aeiouun') || '\M')
   where ma.precio_kg > 0
   order by 7 desc;
$$;

revoke all on function public.mercado_vs_mayoreo(date) from public;
grant execute on function public.mercado_vs_mayoreo(date) to authenticated;
-- service_role también: la Edge Function del resumen diario corre con ella
-- (ver el tropiezo de la migración 103).
grant execute on function public.mercado_vs_mayoreo(date) to service_role;
