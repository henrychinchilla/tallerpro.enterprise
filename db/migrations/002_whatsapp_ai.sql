-- ═══════════════════════════════════════════════════════
-- TallerPro Enterprise — Migración 002
-- Tablas de soporte para WhatsApp e IA, con aislamiento por tenant.
--
-- REQUISITO: la migración 001 debe estar aplicada (usa las funciones
-- current_tenant_id() e is_superadmin()).
-- EJECUTAR EN: Supabase → SQL Editor → New Query → RUN
-- Idempotente.
-- ═══════════════════════════════════════════════════════

begin;

-- ── BITÁCORA DE MENSAJES (WhatsApp / futuros canales) ──
create table if not exists public.mensajes (
  id            uuid default gen_random_uuid() primary key,
  tenant_id     uuid references public.tenants(id) on delete cascade,
  canal         text not null default 'whatsapp',     -- whatsapp | sms | email
  direccion     text not null default 'saliente',     -- saliente | entrante
  destino       text,                                  -- número o dirección
  contenido     text,
  estado        text default 'enviado',                -- enviado | error | recibido | leido
  referencia_id uuid,                                   -- ej. orden_id relacionada
  wa_message_id text,                                   -- id devuelto por Meta
  error         text,
  enviado_por   uuid,
  created_at    timestamptz default now()
);
create index if not exists idx_mensajes_tenant  on public.mensajes(tenant_id);
create index if not exists idx_mensajes_destino on public.mensajes(tenant_id, destino);

-- ── HISTORIAL DE CONVERSACIONES DE IA ──────────────────
create table if not exists public.ai_conversaciones (
  id          uuid default gen_random_uuid() primary key,
  tenant_id   uuid references public.tenants(id) on delete cascade,
  usuario_id  uuid,
  modo        text not null,                            -- diagnostico | redaccion | chat | insights
  pregunta    text,
  respuesta   text,
  created_at  timestamptz default now()
);
create index if not exists idx_ai_conv_tenant on public.ai_conversaciones(tenant_id);

-- ── CONFIG DE INTEGRACIONES POR TENANT ─────────────────
-- (flags y datos no sensibles; los secretos viven en Supabase secrets)
create table if not exists public.config_integraciones (
  tenant_id        uuid primary key references public.tenants(id) on delete cascade,
  whatsapp_activo  boolean default false,
  ia_activa        boolean default false,
  notif_ot_estado  boolean default true,    -- avisar al cliente al cambiar estado de OT
  notif_citas      boolean default true,    -- recordatorios de citas
  updated_at       timestamptz default now()
);

-- ── RLS ────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['mensajes','ai_conversaciones','config_integraciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant_isolation" on public.%I', t);
    execute format($f$
      create policy "tenant_isolation" on public.%I
        for all to authenticated
        using      (tenant_id = public.current_tenant_id() or public.is_superadmin())
        with check (tenant_id = public.current_tenant_id() or public.is_superadmin())
    $f$, t);
  end loop;
end $$;

grant all on public.mensajes, public.ai_conversaciones, public.config_integraciones to authenticated;
-- defensa en profundidad: anon nunca toca estas tablas
revoke all on public.mensajes, public.ai_conversaciones, public.config_integraciones from anon;

commit;
