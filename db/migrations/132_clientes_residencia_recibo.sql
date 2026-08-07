-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 132
-- Agregar campos específicos para el municipio y departamento de la residencia
-- real del cliente, extraídos de su recibo de servicios de agua/luz.
--
-- La vecindad del DPI representa el domicilio legal (RENAP) del ciudadano,
-- el cual puede diferir de la dirección actual de su vivienda (recibo).
-- Estos dos campos permiten generar las declaraciones juradas con la
-- ubicación geográfica exacta de su vivienda actual.
-- ═══════════════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists residencia_municipio text,
  add column if not exists residencia_departamento text;

comment on column public.clientes.residencia_municipio is
  'Municipio de residencia real extraído de su recibo de servicios de luz o agua.';
comment on column public.clientes.residencia_departamento is
  'Departamento de residencia real extraído de su recibo de servicios de luz o agua.';
