-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 125
-- Control de ENTREGA de municiones: saldo a favor del cliente y comprobante.
--
-- EL PROBLEMA QUE RESUELVE (planteado por Henry):
-- La armería quiere vender combos y promociones —por ejemplo 1,000 cartuchos—
-- pero la ley limita cuánto puede LLEVARSE el cliente cada mes:
--
--   Decreto 15-2009, art. 60:
--     · tenencia   → 200 cartuchos al mes
--     · portación  → 250 cartuchos POR ARMA REGISTRADA
--   art. 72: se pueden registrar hasta 3 armas → tope real 750 con portación.
--
-- La clave es que el tope es sobre lo que se ENTREGA, no sobre lo que se
-- compra. Por eso vender 1,000 es legal siempre que se entregue por partes:
-- el resto queda como SALDO A FAVOR del cliente, guardado en la armería, y se
-- va descontando mes a mes con un comprobante de entrega en cada retiro.
--
-- ⚠️ LÍMITE HONESTO DE ESTE CONTROL (reglamento AG 85-2011, art. 21):
-- la cuota es NACIONAL, por persona, no por comercio. Esta app solo ve SUS
-- propias entregas: si el cliente ya compró en otra armería este mes, aquí no
-- se sabe. Por eso el tope que calcula es una REFERENCIA PARCIAL y la entrega
-- exige registrar el código de autorización de DIGECAM, que es el control real.
-- No se debe presentar como "verificado con DIGECAM", porque no lo está.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── Saldo a favor: cuánto compró y cuánto ya se llevó, por calibre ──────
create table if not exists public.armeria_municion_saldos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  calibre     text not null,
  comprado    integer not null default 0 check (comprado  >= 0),
  entregado   integer not null default 0 check (entregado >= 0),
  -- El saldo no se guarda: se deriva. Así no puede quedar desincronizado.
  saldo       integer generated always as (comprado - entregado) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint armeria_saldo_unico unique (tenant_id, cliente_id, calibre),
  -- No se puede entregar más de lo comprado: la base lo impide, no la pantalla.
  constraint armeria_saldo_no_negativo check (entregado <= comprado)
);

-- ── Cada retiro, con su comprobante ─────────────────────────────────────
create table if not exists public.armeria_municion_entregas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  cliente_id    uuid not null references public.clientes(id) on delete restrict,
  operacion_id  uuid references public.armeria_operaciones(id) on delete set null,
  num           text not null,                    -- correlativo del comprobante
  calibre       text not null,
  cantidad      integer not null check (cantidad > 0),
  fecha         date not null default current_date,

  -- Evidencia del momento de la entrega (no se lee del cliente después:
  -- si su licencia cambia, el comprobante debe seguir diciendo lo que había).
  licencia_tipo         text not null check (licencia_tipo in ('tenencia','portación')),
  licencia_num          text,
  licencia_vencimiento  date,
  armas_registradas     integer not null default 1 check (armas_registradas between 1 and 3),

  -- El control REAL: sin código de DIGECAM no hay respaldo de que la cuota
  -- nacional del cliente lo permitía.
  codigo_autorizacion_digecam text,

  recibido_por  text,          -- quién firma que se lo llevó
  entregado_por uuid references public.usuarios(id) on delete set null,
  notas         text,
  created_at    timestamptz not null default now(),
  constraint armeria_entrega_num_unico unique (tenant_id, num)
);

create index if not exists idx_arm_saldos_tenant   on public.armeria_municion_saldos(tenant_id);
create index if not exists idx_arm_saldos_cliente  on public.armeria_municion_saldos(cliente_id);
create index if not exists idx_arm_entregas_tenant on public.armeria_municion_entregas(tenant_id);
create index if not exists idx_arm_entregas_cli    on public.armeria_municion_entregas(cliente_id);
create index if not exists idx_arm_entregas_fecha  on public.armeria_municion_entregas(fecha);
create index if not exists idx_arm_entregas_oper   on public.armeria_municion_entregas(operacion_id);
create index if not exists idx_arm_entregas_usr    on public.armeria_municion_entregas(entregado_por);

comment on table public.armeria_municion_saldos is
  'Munición comprada pero aún no retirada por el cliente. Permite vender combos sin pasarse del tope mensual del art. 60: se entrega por partes.';
comment on table public.armeria_municion_entregas is
  'Cada retiro de munición con su comprobante. El tope que valida es referencia PARCIAL: la cuota del art. 60 es nacional y esta app solo ve sus propias entregas.';

-- ── El tope legal, en la base y no solo en el navegador ─────────────────
-- Se repite aquí lo que ya calcula topeMunicionMensual() en js/core/ley-armas.js
-- a propósito: un tope que solo vive en el front lo salta cualquiera que hable
-- directo con la API. Si cambia la ley, hay que cambiar los dos.
create or replace function public.armeria_tope_municion(
  p_licencia text, p_armas integer
) returns integer
language sql immutable
set search_path to 'public'
as $$
  select case
    when p_licencia = 'portación' then 250 * least(greatest(coalesce(p_armas,1),1),3)
    when p_licencia = 'tenencia'  then 200
    else 0
  end;
$$;

-- ── Guardián de la entrega ──────────────────────────────────────────────
create or replace function public.fn_armeria_validar_entrega()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_saldo   integer;
  v_mes     integer;
  v_tope    integer;
begin
  -- 1) No se entrega lo que no se compró.
  select saldo into v_saldo from public.armeria_municion_saldos
   where tenant_id = new.tenant_id and cliente_id = new.cliente_id and calibre = new.calibre;

  if v_saldo is null then
    raise exception 'El cliente no tiene munición comprada de calibre %. Registre primero la venta.', new.calibre
      using errcode = 'check_violation';
  end if;
  if new.cantidad > v_saldo then
    raise exception 'Solo quedan % cartuchos de saldo (calibre %); se intentó entregar %.',
      v_saldo, new.calibre, new.cantidad using errcode = 'check_violation';
  end if;

  -- 2) Tope mensual del art. 60, sumando TODOS los calibres del mes: el tope
  --    es sobre cartuchos, y un cliente con dos armas de distinto calibre no
  --    puede llevarse el tope completo de cada uno por separado.
  select coalesce(sum(cantidad), 0) into v_mes
    from public.armeria_municion_entregas
   where tenant_id = new.tenant_id and cliente_id = new.cliente_id
     and date_trunc('month', fecha) = date_trunc('month', new.fecha)
     and id <> new.id;

  v_tope := public.armeria_tope_municion(new.licencia_tipo, new.armas_registradas);

  if v_mes + new.cantidad > v_tope then
    raise exception 'Tope mensual del art. 60 superado: % ya entregados este mes + % = %, y el máximo con % (% arma(s)) es %.',
      v_mes, new.cantidad, v_mes + new.cantidad, new.licencia_tipo, new.armas_registradas, v_tope
      using errcode = 'check_violation';
  end if;

  -- 3) Descontar del saldo.
  update public.armeria_municion_saldos
     set entregado = entregado + new.cantidad, updated_at = now()
   where tenant_id = new.tenant_id and cliente_id = new.cliente_id and calibre = new.calibre;

  return new;
end $$;

drop trigger if exists trg_armeria_validar_entrega on public.armeria_municion_entregas;
create trigger trg_armeria_validar_entrega
  before insert on public.armeria_municion_entregas
  for each row execute function public.fn_armeria_validar_entrega();

-- Al borrar una entrega (corrección de un error de captura) el saldo vuelve.
create or replace function public.fn_armeria_revertir_entrega()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.armeria_municion_saldos
     set entregado = greatest(0, entregado - old.cantidad), updated_at = now()
   where tenant_id = old.tenant_id and cliente_id = old.cliente_id and calibre = old.calibre;
  return old;
end $$;

drop trigger if exists trg_armeria_revertir_entrega on public.armeria_municion_entregas;
create trigger trg_armeria_revertir_entrega
  after delete on public.armeria_municion_entregas
  for each row execute function public.fn_armeria_revertir_entrega();

-- ── Vender munición suma saldo automáticamente ──────────────────────────
create or replace function public.fn_armeria_sumar_saldo_municion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.tipo = 'venta' and new.categoria = 'munición'
     and new.cliente_id is not null and coalesce(new.cantidad,0) > 0 then
    insert into public.armeria_municion_saldos (tenant_id, cliente_id, calibre, comprado)
    values (new.tenant_id, new.cliente_id, coalesce(new.calibre,'sin especificar'), new.cantidad)
    on conflict (tenant_id, cliente_id, calibre)
      do update set comprado = public.armeria_municion_saldos.comprado + excluded.comprado,
                    updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists trg_armeria_sumar_saldo on public.armeria_operaciones;
create trigger trg_armeria_sumar_saldo
  after insert on public.armeria_operaciones
  for each row execute function public.fn_armeria_sumar_saldo_municion();

-- ── Permisos y aislamiento ──────────────────────────────────────────────
-- El GRANT va antes que la RLS: sin él, la política no llega a evaluarse.
-- A `authenticated` y NUNCA a `anon` (ver auditoría, migración 122).
grant select, insert, update, delete on public.armeria_municion_saldos   to authenticated;
grant select, insert, update, delete on public.armeria_municion_entregas to authenticated;

alter table public.armeria_municion_saldos   enable row level security;
alter table public.armeria_municion_entregas enable row level security;

drop policy if exists armeria_saldos_tenant   on public.armeria_municion_saldos;
create policy armeria_saldos_tenant on public.armeria_municion_saldos
  for all to authenticated
  using (tenant_id = current_tenant_id() or is_superadmin())
  with check (tenant_id = current_tenant_id() or is_superadmin());

drop policy if exists armeria_entregas_tenant on public.armeria_municion_entregas;
create policy armeria_entregas_tenant on public.armeria_municion_entregas
  for all to authenticated
  using (tenant_id = current_tenant_id() or is_superadmin())
  with check (tenant_id = current_tenant_id() or is_superadmin());
