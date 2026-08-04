-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 109
-- Módulo vertical: Armería (venta y compra de armas y municiones),
-- con los campos de cumplimiento que exige DIGECAM por transacción.
--
-- Marco legal (verificar vigencia directo con DIGECAM antes de operar):
--   - Decreto 15-2009, Ley de Armas y Municiones (LAM), arts. 79-90:
--     licencia de comercialización/compraventa, solo para personas
--     jurídicas. Vender/intermediar sin ella es delito (6-10 años).
--   - Reglamento: Acuerdo Gubernativo 85-2011.
--   - SIDIGECAM: cada venta se registra en tiempo real con datos del
--     comprador (nombre, DPI, licencia de portación vigente, foto y
--     huella tomadas en el local), del arma (marca/modelo/calibre/
--     número de serie/país de origen) y de la munición si aplica.
--   - Munición: se vende con solo mostrar la tarjeta de tenencia o la
--     licencia de portación del arma — no requiere licencia aparte.
--   - Compraventa entre particulares (fuera de este módulo, vía
--     notario): el testimonio va a DIGECAM en 8 días desde el
--     contrato; el notario avisa el contrato en 15 días.
-- Estas cifras salen de fuentes secundarias (trámites/prensa), no del
-- texto legal mismo — el módulo las deja como referencia editable, no
-- como candado: es el taller quien responde ante DIGECAM, no la app.
--
-- Sigue el patrón estándar del proyecto: tenant_id + RLS
-- tenant_isolation + trigger de auditoría (fn_audit, migración 008) +
-- correlativo atómico (siguiente_correlativo, migración 091).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.armeria_operaciones (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  num                 text,
  tipo                text not null default 'venta'
                      check (tipo = any (array['venta', 'compra'])),

  -- Contraparte: cliente (venta, o compra a un particular) o proveedor
  -- (compra a un distribuidor/importador mayorista).
  cliente_id          uuid references public.clientes(id) on delete set null,
  proveedor_id        uuid references public.proveedores(id) on delete set null,
  inventario_id       uuid references public.inventario(id) on delete set null,

  -- Datos del artículo, tal como los pide SIDIGECAM (se copian aquí porque
  -- el número de serie es por UNIDAD física, no por artículo de inventario).
  categoria           text not null default 'no aplica'
                      check (categoria = any (array['pistola','revólver','rifle','escopeta','munición','accesorio','no aplica'])),
  marca               text,
  modelo              text,
  calibre             text,
  numero_serie        text,
  pais_origen         text,
  cantidad            numeric not null default 1 check (cantidad > 0),
  precio_unit         numeric not null default 0 check (precio_unit >= 0),
  total               numeric not null default 0 check (total >= 0),

  -- Cumplimiento DIGECAM de la contraparte (comprador en venta, vendedor en
  -- compra): qué licencia presentó y su vigencia.
  contraparte_licencia_tipo         text
                      check (contraparte_licencia_tipo is null or contraparte_licencia_tipo = any (array['tenencia','portación'])),
  contraparte_licencia_num          text,
  contraparte_licencia_vencimiento  date,
  foto_tomada         boolean not null default false,
  huella_tomada       boolean not null default false,

  -- Notificación a DIGECAM (registro manual del taller; SIDIGECAM no tiene
  -- API pública, así que la app no la envía — solo lleva el control).
  notificado_digecam            boolean not null default false,
  fecha_notificacion_digecam    date,
  folio_notificacion_digecam    text,

  factura_id          uuid references public.facturas(id) on delete set null,
  forma_pago          text default 'efectivo',
  fecha               timestamptz not null default now(),
  notas               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),

  -- El arma exige número de serie; la munición y accesorios no lo llevan.
  constraint armeria_serie_si_es_arma check (
    categoria not in ('pistola','revólver','rifle','escopeta') or coalesce(numero_serie, '') <> ''
  ),
  -- La ley permite vender munición con solo mostrar la tenencia/portación
  -- (no exige licencia aparte), pero exige mostrar ALGUNA licencia para
  -- vender armas o munición. Los accesorios (funda, kit de limpieza) no.
  constraint armeria_licencia_si_venta_arma_o_municion check (
    tipo <> 'venta' or categoria = 'accesorio' or coalesce(contraparte_licencia_num, '') <> ''
  )
);
create index if not exists idx_armeria_tenant on public.armeria_operaciones(tenant_id);
create index if not exists idx_armeria_cliente on public.armeria_operaciones(cliente_id);
create index if not exists idx_armeria_fecha on public.armeria_operaciones(tenant_id, fecha desc);

alter table public.armeria_operaciones enable row level security;
drop policy if exists tenant_isolation on public.armeria_operaciones;
create policy tenant_isolation on public.armeria_operaciones
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_superadmin())
  with check (tenant_id = public.current_tenant_id() or public.is_superadmin());
-- select/insert/update/delete solamente: TRUNCATE no pasa por RLS, así que
-- otorgarlo dejaría a cualquier usuario con sesión vaciar la tabla entera
-- (hueco documentado en migraciones viejas del proyecto; no repetirlo aquí).
grant select, insert, update, delete on public.armeria_operaciones to authenticated;
revoke all on public.armeria_operaciones from anon;
drop trigger if exists trg_audit on public.armeria_operaciones;
create trigger trg_audit after insert or update or delete on public.armeria_operaciones
  for each row execute function public.fn_audit();
