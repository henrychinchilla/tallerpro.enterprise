-- ═══════════════════════════════════════════════════════════════
-- TallerPro Enterprise — Migración 004
-- Tipo de vehículo (Liviano / SUV / Pesado / Motocicleta)
--
-- APLICADA EN PRODUCCIÓN: 2026-06-07 (vehiculos_add_tipo)
--
-- Texto libre (validado en la UI) para no encerrar tipos futuros.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.vehiculos add column if not exists tipo text;
comment on column public.vehiculos.tipo is 'Liviano | SUV | Pesado | Motocicleta (texto libre validado en UI)';
