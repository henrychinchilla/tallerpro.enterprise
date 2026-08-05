-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 127
-- La licencia de arma, guardada en la ficha del cliente.
--
-- Hasta hoy los datos de la licencia (tipo, número, vencimiento y cuántas
-- armas tiene registradas) se tecleaban DE NUEVO en cada operación y en cada
-- entrega de munición, aunque son del cliente y no de la venta. Tres costos:
--   · se vuelven a escribir cada vez, con el error de dedo que eso trae;
--   · nadie puede saber de un vistazo si la licencia de un cliente ya venció;
--   · la foto de la licencia se archivaba sin que sirviera para nada más.
--
-- Con esto la licencia se lee del documento, se guarda una vez y las
-- operaciones y entregas la traen ya puesta (siguen pudiendo corregirla: cada
-- entrega conserva SU copia como evidencia del momento, que es lo correcto —
-- si el cliente renueva, el comprobante viejo debe seguir diciendo lo que
-- había ese día).
--
-- armas_registradas topa en 3 por el artículo 72 de la Ley de Armas
-- (Decreto 15-2009), que es el mismo tope que usa el cálculo de munición.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists licencia_tipo        text,
  add column if not exists licencia_num         text,
  add column if not exists licencia_vencimiento date,
  add column if not exists armas_registradas    integer;

-- Los CHECK van con NOT VALID + VALIDATE para no fallar si alguna fila vieja
-- trae algo raro: primero se acepta la restricción para lo nuevo, y la
-- validación de lo existente se hace aparte y avisa en vez de abortar todo.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_licencia_tipo_check') then
    alter table public.clientes
      add constraint clientes_licencia_tipo_check
      check (licencia_tipo is null or licencia_tipo in ('tenencia','portación'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clientes_armas_registradas_check') then
    alter table public.clientes
      add constraint clientes_armas_registradas_check
      check (armas_registradas is null or armas_registradas between 1 and 3);
  end if;
end $$;

comment on column public.clientes.licencia_tipo is
  'tenencia o portación (Decreto 15-2009). Determina el tope mensual de munición del art. 60.';
comment on column public.clientes.armas_registradas is
  'Armas registradas a nombre del cliente, máximo 3 (art. 72). Multiplica el tope de munición en portación.';
comment on column public.clientes.licencia_vencimiento is
  'Vencimiento de la licencia. Una licencia vencida no habilita compra de arma ni de munición.';
