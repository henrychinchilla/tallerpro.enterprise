-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 120
-- Régimen de ISR con nombre propio (no solo la tasa suelta).
--
-- Por qué: el ISR es un impuesto DISTINTO del IVA. En Guatemala el IVA es 12%
-- (o 5% en Pequeño Contribuyente) y NO existe un IVA del 25%; el 25% es la
-- tasa del ISR sobre utilidades. Hasta hoy la app solo guardaba `tasa_isr`
-- (un número), así que el régimen quedaba implícito: cualquiera que leyera
-- 0.05 no podía saber si era el opcional simplificado o un dato mal puesto.
--
-- Además el registro nunca preguntaba por el ISR: TODO comercio nuevo nacía
-- con tasa_isr = 0.05 (opcional simplificado). Para un negocio que en realidad
-- tributa sobre utilidades, eso hacía mal el recomendador de precios, que usa
-- la tasa para calcular el margen neto (js/modulos/finanzas/precios.js).
--
-- Base legal: Ley de Actualización Tributaria, Decreto 10-2012.
--   · utilidades             → 25% sobre la renta imponible (los gastos deducen)
--   · opcional_simplificado  → 5% hasta Q30,000 de ingresos al mes, 7% arriba
--                              (sobre ingresos brutos: los gastos NO deducen)
--
-- No se pone CHECK a propósito: `regimen_iva` tampoco lo tiene y el catálogo
-- de regímenes vive en js/core/config.js, que es lo que se actualiza cuando
-- la SAT cambia las reglas. Un CHECK obligaría a una migración por cada cambio.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.config_fiscal
  add column if not exists regimen_isr text not null default 'opcional_simplificado';

alter table public.solicitudes_comercio
  add column if not exists regimen_isr text not null default 'opcional_simplificado';

comment on column public.config_fiscal.regimen_isr is
  'Régimen de ISR: utilidades (25% s/utilidad) u opcional_simplificado (5%/7% s/ingresos). Decreto 10-2012. La tasa vigente va en tasa_isr.';

comment on column public.solicitudes_comercio.regimen_isr is
  'Régimen de ISR elegido al registrarse; se copia a config_fiscal al aprobar la solicitud.';

-- Backfill: los comercios que ya existen quedan clasificados por la tasa que
-- tienen guardada. 0.25 solo se usa en el régimen sobre utilidades, así que
-- el corte en 0.2 no puede confundirse con el 5%/7% del simplificado — es el
-- mismo criterio que ya usaba la UI de Contabilidad → SAT.
update public.config_fiscal
   set regimen_isr = 'utilidades'
 where coalesce(tasa_isr, 0) >= 0.2
   and regimen_isr <> 'utilidades';
