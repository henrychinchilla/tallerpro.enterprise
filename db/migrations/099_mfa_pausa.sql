-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 099
-- PAUSAR el 2FA en vez de desactivarlo
--
-- Desactivar el 2FA borra el factor TOTP en Supabase: se pierde el secreto
-- y hay que volver a escanear el QR para reactivarlo. Pausar deja el factor
-- enrolado (mismo secreto, mismo autenticador) y sólo salta el reto al
-- entrar; reanudar es un clic, sin volver a enrolar.
--
-- SEGURIDAD — por qué esto NO es el viejo `mfa_bypass` de localStorage:
--   · El bypass vivía en el navegador: cualquiera con la contraseña lo
--     escribía a mano y entraba. La pausa vive en la BD.
--   · Para PAUSAR hay que llegar a aal2, o sea haber verificado un código
--     del autenticador en esta misma sesión. Quien sólo tiene la contraseña
--     se queda en aal1 y no puede pausarse el 2FA para saltárselo.
--   · Sólo sobre la propia fila. La política RLS de `usuarios` es por tenant
--     (un compañero puede editar tu fila), así que el guard exige
--     NEW.id = auth.uid(): nadie le pausa el 2FA a otro.
--   · REANUDAR no pide nada: subir la seguridad nunca se bloquea.
--   · El trigger es la frontera real — vale igual si la llamada viene de la
--     app o de un PATCH directo a PostgREST con el token aal1.
--
-- La marca de tiempo la pone el trigger, no el cliente.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.usuarios
  add column if not exists mfa_pausado    boolean not null default false,
  add column if not exists mfa_pausado_at timestamptz;

comment on column public.usuarios.mfa_pausado is
  'true = el reto 2FA no se pide al entrar, pero el factor TOTP sigue enrolado. Sólo se activa con sesión aal2 (ver fn_guard_mfa_pausa).';

create or replace function public.fn_guard_mfa_pausa()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  -- Update que no toca la pausa (ultimo_login, nombre, rol…): pasa de largo.
  if NEW.mfa_pausado is not distinct from OLD.mfa_pausado then
    return NEW;
  end if;

  NEW.mfa_pausado_at := case when NEW.mfa_pausado then now() else null end;

  -- Reanudar el 2FA: siempre permitido.
  if NEW.mfa_pausado is not true then
    return NEW;
  end if;

  -- Sin JWT (SQL directo, migración) o service_role (Edge Function): permitido.
  if v_claims is null or v_claims->>'role' = 'service_role' then
    return NEW;
  end if;

  if NEW.id is distinct from auth.uid() then
    raise exception 'Sólo puedes pausar tu propio 2FA' using errcode = '42501';
  end if;

  if coalesce(v_claims->>'aal', 'aal1') <> 'aal2' then
    raise exception 'Para pausar el 2FA hay que verificar antes un código del autenticador'
      using errcode = '42501';
  end if;

  return NEW;
end $fn$;

drop trigger if exists trg_guard_mfa_pausa on public.usuarios;
create trigger trg_guard_mfa_pausa
  before update on public.usuarios
  for each row execute function public.fn_guard_mfa_pausa();
