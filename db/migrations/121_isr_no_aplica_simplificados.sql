-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 121
-- En los regímenes simplificados NO hay régimen de ISR.
--
-- La 120 dejó regimen_isr NOT NULL con default 'opcional_simplificado'. Está
-- mal para el Pequeño Contribuyente y para el Contribuyente Agropecuario: su
-- tasa única sobre ingresos brutos es de pago DEFINITIVO y los releva de
-- presentar y pagar ISR —anual, trimestral o mensual— y el ISO.
--   · Pequeño Contribuyente     — Decreto 27-92 (Ley del IVA), arts. 45 a 50.
--   · Contribuyente Agropecuario — Decreto 7-2019.
-- Guardarles 'opcional_simplificado' con tasa 0.05 afirma que pagan un ISR
-- que por ley no pagan, y el recomendador de precios lo restaba del margen.
--
-- Se permite null = "no aplica". Un valor por defecto acá miente; null no.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.config_fiscal          alter column regimen_isr drop not null;
alter table public.solicitudes_comercio   alter column regimen_isr drop not null;

alter table public.config_fiscal          alter column regimen_isr drop default;
alter table public.solicitudes_comercio   alter column regimen_isr drop default;

comment on column public.config_fiscal.regimen_isr is
  'Régimen de ISR: utilidades (25% s/utilidad) u opcional_simplificado (5%/7% s/ingresos). NULL = no aplica, porque el régimen de IVA es simplificado y su pago es definitivo (Decretos 27-92 y 7-2019). La tasa vigente va en tasa_isr.';

comment on column public.solicitudes_comercio.regimen_isr is
  'Régimen de ISR elegido al registrarse; NULL si el régimen de IVA es simplificado (no aplica). Se copia a config_fiscal al aprobar la solicitud.';

-- Los simplificados que ya existen quedan en "no aplica" y sin tasa. El
-- catálogo de regímenes vive en js/core/config.js, así que la lista se repite
-- acá en vez de consultarse: si la SAT agrega otro simplificado hay que
-- sumarlo en los dos lados.
update public.config_fiscal
   set regimen_isr = null, tasa_isr = 0
 where regimen_iva in ('pequeno','pequeno_electronico','agropecuario','agropecuario_electronico')
   and (regimen_isr is not null or coalesce(tasa_isr, 0) <> 0);

update public.solicitudes_comercio
   set regimen_isr = null
 where regimen_iva in ('pequeno','pequeno_electronico','agropecuario','agropecuario_electronico')
   and regimen_isr is not null;
