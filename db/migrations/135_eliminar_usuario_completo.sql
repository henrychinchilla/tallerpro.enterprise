-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 135
-- Que ELIMINAR un usuario lo saque de verdad de la base
--
-- Henry lo pidió claro: inactivar es una cosa y eliminar es otra — "si se
-- elimina debe salir por completo de la aplicación y la base de datos".
--
-- LO QUE LO IMPEDÍA: cajas_pos.usuario_apertura_id y usuario_cierre_id
-- apuntaban a usuarios con NO ACTION, así que borrar a quien alguna vez abrió
-- o cerró una caja fallaba con 23503. No era capricho: un arqueo sin
-- responsable no sirve para nada, y ésa es justo la fila que revisa quien
-- audita una caja.
--
-- LA SALIDA: guardar el NOMBRE en la propia fila del arqueo y soltar la llave
-- (SET NULL). Así la persona desaparece de la base —no queda cuenta, ni
-- perfil, ni acceso— y el corte de caja sigue diciendo quién lo hizo. Es la
-- diferencia entre "quién es este usuario del sistema" (se borra) y "quién
-- contó este efectivo aquel día" (es historia, y no se toca).
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.cajas_pos
  add column if not exists usuario_apertura_nombre text,
  add column if not exists usuario_cierre_nombre   text;

comment on column public.cajas_pos.usuario_apertura_nombre is
  'Nombre de quien abrió la caja, copiado al abrirla. Sobrevive al borrado del usuario: el arqueo tiene que seguir diciendo quién lo hizo.';
comment on column public.cajas_pos.usuario_cierre_nombre is
  'Nombre de quien cerró la caja. Mismo motivo que el de apertura.';

-- Rellenar lo que ya existe, mientras los usuarios siguen estando.
update public.cajas_pos c
   set usuario_apertura_nombre = coalesce(c.usuario_apertura_nombre, u.nombre)
  from public.usuarios u
 where u.id = c.usuario_apertura_id
   and c.usuario_apertura_nombre is null;

update public.cajas_pos c
   set usuario_cierre_nombre = coalesce(c.usuario_cierre_nombre, u.nombre)
  from public.usuarios u
 where u.id = c.usuario_cierre_id
   and c.usuario_cierre_nombre is null;

-- ── El id de quien abrió la caja tiene que poder quedar en NULL ─────────────
-- `usuario_apertura_id` era NOT NULL, así que un ON DELETE SET NULL fallaba
-- igual (23502) y el usuario seguía sin poderse borrar. Descubierto probando
-- el borrado completo contra la base real, no leyendo el esquema: la llave y
-- la restricción se contradecían.
-- Se puede soltar porque el dato que importa —el NOMBRE— ya quedó en la fila.
alter table public.cajas_pos
  alter column usuario_apertura_id drop not null;

-- ── Soltar la llave: borrar al usuario deja el id en NULL, no revienta ──
-- Se buscan las constraints por su definición y no por un nombre adivinado:
-- un nombre distinto (por haberse creado en otra migración) dejaría esto sin
-- efecto y el borrado seguiría fallando en producción.
do $$
declare
  r record;
begin
  for r in
    select con.conname, att.attname
      from pg_constraint con
      join unnest(con.conkey) with ordinality k(attnum, ord) on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
     where con.contype = 'f'
       and con.conrelid = 'public.cajas_pos'::regclass
       and con.confrelid = 'public.usuarios'::regclass
       and con.confdeltype <> 'n'          -- 'n' = SET NULL: ya está como se quiere
  loop
    execute format('alter table public.cajas_pos drop constraint %I', r.conname);
    execute format(
      'alter table public.cajas_pos add constraint %I foreign key (%I) references public.usuarios(id) on delete set null',
      r.conname, r.attname);
  end loop;
end $$;

-- ── Que el nombre se guarde solo de aquí en adelante ────────────────────────
-- Si dependiera de que la app lo mande, el día que alguien abra una caja desde
-- otra pantalla el arqueo volvería a quedar anónimo.
create or replace function public.cajas_pos_guardar_nombres()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.usuario_apertura_id is not null and new.usuario_apertura_nombre is null then
    select nombre into new.usuario_apertura_nombre from public.usuarios where id = new.usuario_apertura_id;
  end if;
  if new.usuario_cierre_id is not null and new.usuario_cierre_nombre is null then
    select nombre into new.usuario_cierre_nombre from public.usuarios where id = new.usuario_cierre_id;
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_cajas_pos_nombres on public.cajas_pos;
create trigger trg_cajas_pos_nombres
  before insert or update on public.cajas_pos
  for each row execute function public.cajas_pos_guardar_nombres();
