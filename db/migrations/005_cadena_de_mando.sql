-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 005
-- Cadena de mando / organigrama (a quién reporta cada quien)
--
-- APLICADA EN PRODUCCIÓN: 2026-06-07 (cadena_de_mando_reporta_a)
--
-- `reporta_a` self-referencial. NULL = tope de la jerarquía
-- (CEO / Dueño / Gerente General). ON DELETE SET NULL para no romper
-- el árbol si se elimina un jefe.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.empleados add column if not exists reporta_a uuid references public.empleados(id) on delete set null;
alter table public.usuarios  add column if not exists reporta_a uuid references public.usuarios(id)  on delete set null;
comment on column public.empleados.reporta_a is 'Jefe directo (empleados.id). NULL = CEO/Dueño/Gerente General';
comment on column public.usuarios.reporta_a  is 'Jefe directo (usuarios.id). NULL = tope de la jerarquía';
