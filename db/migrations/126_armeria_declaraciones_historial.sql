-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 126
-- Historial de declaraciones juradas de armería.
--
-- Hasta hoy la app ARMABA la declaración y la mandaba a imprimir, pero no
-- guardaba nada: si el cliente volvía por una copia, o si DIGECAM o la IVE
-- preguntaban qué se declaró y cuándo, había que rehacer el documento — y el
-- rehecho no era el mismo, porque el texto se edita a mano antes de firmarlo
-- (ingresos, actividad económica, municipio). Se perdía justo la versión que
-- el cliente firmó ante notario.
--
-- Por eso se guarda el CONTENIDO YA EDITADO, no los campos sueltos: lo que
-- vale como respaldo es el papel que se firmó, no los datos con los que se
-- armó. `contenido_html` es ese documento tal cual quedó.
--
-- La edad NO se guarda como número (se deriva de la fecha de nacimiento al
-- generar) pero sí queda dentro de contenido_html, que es lo correcto: el
-- documento debe decir la edad que tenía el declarante el día que juró.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.armeria_declaraciones (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  num           text not null,
  tipo          text not null check (tipo in ('ingresos','portacion','origen_fondos')),
  titulo        text not null,
  base_legal    text,

  -- Puede no haber cliente: un documento en blanco para llenar a mano es un
  -- caso válido, y la declaración del art. 72 no requiere venta de por medio.
  cliente_id    uuid references public.clientes(id) on delete set null,
  operacion_id  uuid references public.armeria_operaciones(id) on delete set null,

  -- Copia del nombre y DPI al momento de firmar: si el cliente se corrige o se
  -- borra, el historial debe seguir diciendo quién juró.
  cliente_nombre text,
  cliente_dpi    text,

  contenido_html text not null,
  fecha          date not null default current_date,
  generado_por   uuid references public.usuarios(id) on delete set null,
  notas          text,
  created_at     timestamptz not null default now(),
  constraint armeria_decl_num_unico unique (tenant_id, num)
);

create index if not exists idx_arm_decl_tenant  on public.armeria_declaraciones(tenant_id);
create index if not exists idx_arm_decl_cliente on public.armeria_declaraciones(cliente_id);
create index if not exists idx_arm_decl_oper    on public.armeria_declaraciones(operacion_id);
create index if not exists idx_arm_decl_fecha   on public.armeria_declaraciones(fecha);
create index if not exists idx_arm_decl_usuario on public.armeria_declaraciones(generado_por);
create index if not exists idx_arm_decl_tipo    on public.armeria_declaraciones(tipo);

comment on table public.armeria_declaraciones is
  'Declaraciones juradas emitidas (art. 59, art. 72 y origen de fondos). Guarda el documento YA EDITADO, que es lo que el cliente firmó ante notario, no los campos con los que se armó.';
comment on column public.armeria_declaraciones.contenido_html is
  'El documento tal cual quedó tras editarlo. Se sanea al guardar y al reimprimir (sin script, sin on*, sin javascript:).';
comment on column public.armeria_declaraciones.cliente_nombre is
  'Nombre copiado al emitir: si el cliente cambia o se borra, el historial debe seguir diciendo quién juró.';

-- El GRANT va antes que la RLS. A authenticated y nunca a anon (migración 122).
grant select, insert, update, delete on public.armeria_declaraciones to authenticated;

alter table public.armeria_declaraciones enable row level security;

drop policy if exists armeria_declaraciones_tenant on public.armeria_declaraciones;
create policy armeria_declaraciones_tenant on public.armeria_declaraciones
  for all to authenticated
  using (tenant_id = current_tenant_id() or is_superadmin())
  with check (tenant_id = current_tenant_id() or is_superadmin());
