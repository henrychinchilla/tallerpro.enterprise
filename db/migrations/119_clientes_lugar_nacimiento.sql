-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 119
-- Lugar de nacimiento del cliente — viene impreso en el DPI y lo pide la
-- lectura automática del documento.
--
-- Se agrega ahora que el DPI se lee con IA: el documento trae municipio y
-- departamento de nacimiento, y tener que volver a teclearlos cuando la
-- foto ya los muestra sería desperdiciar la lectura.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.clientes add column if not exists lugar_nacimiento text;

comment on column public.clientes.lugar_nacimiento is
  'Municipio y departamento de nacimiento, como aparece en el DPI. Se llena automáticamente al leer el documento.';
