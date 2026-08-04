-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 112
-- Armería: trazabilidad real contra inventario + los datos que la Ley de
-- Armas y Municiones (Decreto 15-2009) exige y que faltaban.
--
-- Se leyó el texto literal de la ley (no un resumen de prensa como en la
-- migración 110) y eso corrigió tres cosas:
--
--  1) Art. 60 — el tope de munición es 250 POR CADA ARMA registrada en la
--     licencia de portación (art. 72: hasta 3 armas por licencia), o 200 con
--     registro de tenencia. La mig 110 lo trataba como un tope plano de 250.
--     Se agrega `contraparte_armas_registradas` para poder calcularlo bien.
--  2) Art. 60 — la factura de munición debe llevar nombre, DIRECCIÓN y NIT
--     del comprador, más el número de tarjeta/licencia y su firma. Faltaban
--     dirección y NIT.
--  3) Art. 59 — la venta de un ARMA no es instantánea: el vendedor remite la
--     documentación y el arma a DIGECAM, que en ≤5 días hábiles devuelve la
--     autorización de entrega y la tarjeta de tenencia. Recién entonces se
--     entrega. Se agrega `estado` para no dar por entregada un arma que
--     legalmente todavía no puede salir del local.
--
-- Y la trazabilidad que pidió Henry: `inventario_id` ya existía (mig 109)
-- pero nada lo llenaba. Ahora la app lo usa y mueve el stock, así el arma
-- vendida se puede rastrear hasta el artículo que entró al inventario —
-- que es lo que exige el art. 58 (inventario físico exacto, so pena de
-- cierre del establecimiento).
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.armeria_operaciones
  add column if not exists contraparte_armas_registradas integer default 1,
  add column if not exists contraparte_nit text,
  add column if not exists contraparte_direccion text,
  add column if not exists estado text default 'entregado';

-- Art. 72: una licencia de portación ampara hasta 3 armas.
alter table public.armeria_operaciones drop constraint if exists armeria_armas_registradas_rango;
alter table public.armeria_operaciones add constraint armeria_armas_registradas_rango
  check (contraparte_armas_registradas is null or contraparte_armas_registradas between 1 and 3);

-- Estados del trámite del art. 59. Munición y accesorios se entregan en el
-- acto ('entregado'); un arma pasa por DIGECAM antes de poder entregarse.
alter table public.armeria_operaciones drop constraint if exists armeria_estado_valido;
alter table public.armeria_operaciones add constraint armeria_estado_valido
  check (estado = any (array['documentos_recibidos','enviado_digecam','autorizado','entregado','cancelado']));

create index if not exists idx_armeria_estado on public.armeria_operaciones(tenant_id, estado)
  where estado <> 'entregado';
create index if not exists idx_armeria_inventario on public.armeria_operaciones(inventario_id)
  where inventario_id is not null;
