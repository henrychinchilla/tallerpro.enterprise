-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 113
-- Cotizar un arma reventaba: el check de `cotizaciones.modulo_origen`
-- (migración 045) enumera los verticales uno por uno y nunca se actualizó
-- al agregar armería, agroservicio ni venta de granos. Una cotización de
-- esos giros fallaba con check_violation, no con un mensaje entendible.
--
-- Se agregan los tres que faltaban. Henry pidió expresamente que armería
-- llegara a cotizaciones, y los otros dos tenían el mismo hueco silencioso.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.cotizaciones drop constraint if exists cotizaciones_modulo_origen_check;
alter table public.cotizaciones add constraint cotizaciones_modulo_origen_check
  check (modulo_origen = any (array[
    'general','taller','herreria','peleteria','electronica','refrigeracion',
    'armeria','agroservicio','venta_granos'
  ]));
