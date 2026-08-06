-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 131
-- Libro, folio y página del registro civil (los "L: F: P:" del DPI).
--
-- En el reverso del DPI, bajo el lugar de nacimiento, aparece algo como
-- "L:102  F:42  P:263". Es la referencia del asiento en el registro civil de
-- donde el RENAP tomó los datos al migrar de Cédula de Vecindad a DPI.
--
-- Para qué sirve guardarlo: es lo que permite pedir una certificación de
-- nacimiento o rastrear el asiento original si un dato del DPI se discute.
-- En un expediente de armería —que se defiende ante DIGECAM y ante notario—
-- poder señalar el asiento exacto vale más que una fotocopia más.
--
-- Van como TEXTO y no como número: en asientos viejos aparecen con letras o
-- ceros a la izquierda que un integer se comería.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists registro_libro  text,
  add column if not exists registro_folio  text,
  add column if not exists registro_pagina text;

comment on column public.clientes.registro_libro is
  'La "L:" del reverso del DPI. Asiento del registro civil de donde RENAP tomó los datos al pasar de Cédula a DPI.';
comment on column public.clientes.registro_folio is 'La "F:" del reverso del DPI.';
comment on column public.clientes.registro_pagina is 'La "P:" del reverso del DPI.';
