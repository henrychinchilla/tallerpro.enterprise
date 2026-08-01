-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 103
-- Oportunidades del día + a quién se le manda el resumen
--
-- 1) CONFIGURACIÓN POR COMERCIO
--    El resumen diario es del CLIENTE que administra el negocio, no de una
--    casilla fija nuestra. Por eso el destinatario se guarda por tenant y se
--    activa por tenant: un comercio que no lo quiere, no lo recibe.
--    `email_reporte_maga` NULL = usar el correo del comercio (tenants.email).
--
-- 2) QUÉ ES UNA "OPORTUNIDAD"
--    Tres señales, todas comparando contra la propia historia del producto en
--    ese mercado — no contra un número inventado:
--      · COMPRA  → hoy está >= umbral% POR DEBAJO de su referencia.
--      · VENTA   → hoy está >= umbral% POR ENCIMA de su referencia.
--      · BRECHA  → el mismo producto cuesta >= umbral% menos en un mercado que
--                  en el otro EL MISMO DÍA (comprar en el barato).
--
--    La referencia es el promedio de los últimos 30 días DIARIOS. Como el MAGA
--    sólo deja expuestos los últimos días, al principio esa serie es corta: si
--    no hay al menos 3 días se cae al promedio de la serie MENSUAL de los
--    últimos 120 días, que sí tiene años de historia. El origen se devuelve en
--    `origen_ref` para que el correo pueda decir con qué se comparó en vez de
--    aparentar una precisión que no tiene.
--
--    Se excluyen referencias en cero (división) y variaciones absurdas de más
--    de 300%, que en esta serie son error de captura del MAGA, no negocio.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.tenants
  add column if not exists email_reporte_maga  text,
  add column if not exists reporte_maga_diario boolean not null default false;

comment on column public.tenants.email_reporte_maga is
  'Destinatario del resumen diario de precios MAGA. NULL = usar tenants.email.';
comment on column public.tenants.reporte_maga_diario is
  'true = este comercio recibe el resumen diario de oportunidades.';

drop function if exists public.maga_oportunidades_diarias(date, numeric, integer);

create or replace function public.maga_oportunidades_diarias(
  p_fecha   date    default null,
  p_umbral  numeric default 8,
  p_top     integer default 8
)
returns table (
  tipo        text,
  producto_id bigint,
  producto    text,
  medida      text,
  mercado     text,
  precio      numeric,
  referencia  numeric,
  variacion   numeric,
  origen_ref  text,
  fecha       date
)
language sql
stable
security definer
set search_path = public
as $$
  with ref as (
    select coalesce(p_fecha, max(d.fecha)) as f from public.maga_precios_diarios d
  ),
  hoy as (
    select d.producto_id, d.mercado, d.precio, d.fecha
      from public.maga_precios_diarios d, ref
     where d.fecha = ref.f
  ),
  base_diaria as (
    select d.producto_id, d.mercado, avg(d.precio) as prom, count(*) as n
      from public.maga_precios_diarios d, ref
     where d.fecha < ref.f and d.fecha >= ref.f - 30
     group by 1, 2
  ),
  base_mensual as (
    select m.producto_id, m.mercado, avg(m.precio) as prom
      from public.maga_precios m, ref
     where m.fecha >= ref.f - 120
     group by 1, 2
  ),
  calc as (
    select h.producto_id, h.mercado, h.precio, h.fecha,
           case when coalesce(bd.n, 0) >= 3 then bd.prom else bm.prom end as referencia,
           case when coalesce(bd.n, 0) >= 3 then 'diaria' else 'mensual' end as origen_ref
      from hoy h
      left join base_diaria  bd on bd.producto_id = h.producto_id and bd.mercado = h.mercado
      left join base_mensual bm on bm.producto_id = h.producto_id and bm.mercado = h.mercado
  ),
  variaciones as (
    select c.*, round((c.precio - c.referencia) / c.referencia * 100, 1) as variacion
      from calc c
     where c.referencia is not null and c.referencia > 0
  ),
  senales as (
    select case when v.variacion <= -p_umbral then 'compra' else 'venta' end as tipo,
           v.producto_id, p.nombre as producto, p.medida, v.mercado,
           v.precio, round(v.referencia, 2) as referencia, v.variacion, v.origen_ref, v.fecha,
           row_number() over (
             partition by case when v.variacion <= -p_umbral then 'compra' else 'venta' end
             order by abs(v.variacion) desc
           ) as puesto
      from variaciones v
      join public.maga_productos p on p.id = v.producto_id
     where abs(v.variacion) >= p_umbral
       and abs(v.variacion) <= 300
  ),
  brechas as (
    select 'brecha'::text as tipo, a.producto_id, p.nombre as producto, p.medida,
           a.mercado, a.precio, b.precio as referencia,
           round((a.precio - b.precio) / b.precio * 100, 1) as variacion,
           'mismo dia'::text as origen_ref, a.fecha,
           row_number() over (order by abs((a.precio - b.precio) / b.precio) desc) as puesto
      from hoy a
      join hoy b on b.producto_id = a.producto_id and b.mercado <> a.mercado
      join public.maga_productos p on p.id = a.producto_id
     where b.precio > 0
       and a.precio < b.precio                                  -- 'a' es el barato
       and (b.precio - a.precio) / b.precio * 100 >= p_umbral
  )
  /* El UNION va dentro de un FROM: Postgres no acepta ordenar el resultado de
     un UNION por una expresión (abs(...)), sólo por nombre de columna. */
  select u.tipo, u.producto_id, u.producto, u.medida, u.mercado,
         u.precio, u.referencia, u.variacion, u.origen_ref, u.fecha
    from (
      select tipo, producto_id, producto, medida, mercado, precio, referencia, variacion, origen_ref, fecha
        from senales where puesto <= p_top
      union all
      select tipo, producto_id, producto, medida, mercado, precio, referencia, variacion, origen_ref, fecha
        from brechas where puesto <= p_top
    ) u
   order by u.tipo, abs(u.variacion) desc;
$$;

revoke all on function public.maga_oportunidades_diarias(date, numeric, integer) from public;
grant execute on function public.maga_oportunidades_diarias(date, numeric, integer) to authenticated;
/* OJO: `revoke ... from public` también se lo quita a service_role, que es con
   quien corre la Edge Function del resumen diario — sin esta línea el correo
   muere con "permission denied for function". Mismo descuido que el upsert de
   la migración 100, visto desde el otro lado: el permiso se piensa para el
   usuario de la app y se olvida el proceso de servidor. */
grant execute on function public.maga_oportunidades_diarias(date, numeric, integer) to service_role;
