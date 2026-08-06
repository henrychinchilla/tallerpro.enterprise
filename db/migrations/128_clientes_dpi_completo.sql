-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 128
-- Los datos del DPI que faltaban, y el lugar partido en departamento+municipio.
--
-- Salió de revisar el DPI real de un cliente contra lo que guardaba la app.
-- El DPI trae más de lo que se estaba capturando, y varias cosas mal armadas:
--
--   · SEXO: está impreso en el anverso y no se guardaba. La declaración
--     jurada lo necesita para concordar el género ("el declarante" / "la
--     declarante", "casado" / "casada").
--   · LUGAR DE NACIMIENTO y VECINDAD vienen como DOS líneas —departamento y
--     municipio— y se guardaban como un solo texto. Partirlos permite además
--     derivar el código postal, que hoy nadie escribe.
--   · VECINDAD no existía como campo: es dónde vive AHORA, distinto del lugar
--     de nacimiento y distinto de la dirección exacta.
--   · FECHA DE VENCIMIENTO del DPI: un DPI vencido no identifica a nadie, y
--     la app no tenía cómo avisarlo.
--   · NÚMERO DE SERIE y VERSIÓN del documento (el "004" al pie): identifican
--     el ejemplar físico. La SAT pide la versión para actualizar datos.
--   · FECHA DE EMISIÓN: va bajo la fotografía.
--
-- Los campos viejos lugar_nacimiento y direccion NO se tocan: el primero
-- queda como respaldo de lo ya capturado y la dirección exacta (calle, lote,
-- manzana) sigue siendo suya. Los nuevos son más finos, no un reemplazo.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists sexo                      text,
  add column if not exists nacimiento_departamento   text,
  add column if not exists nacimiento_municipio      text,
  add column if not exists nacimiento_codigo_postal  text,
  add column if not exists vecindad_departamento     text,
  add column if not exists vecindad_municipio        text,
  add column if not exists codigo_postal             text,
  add column if not exists dpi_fecha_emision         date,
  add column if not exists dpi_fecha_vencimiento     date,
  add column if not exists dpi_numero_serie          text,
  add column if not exists dpi_version               text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_sexo_check') then
    alter table public.clientes
      add constraint clientes_sexo_check
      check (sexo is null or sexo in ('masculino','femenino'));
  end if;
end $$;

comment on column public.clientes.sexo is
  'masculino o femenino, como lo imprime el DPI. Lo usa la declaración jurada para concordar el género.';
comment on column public.clientes.vecindad_departamento is
  'VECINDAD del DPI: dónde vive AHORA. Distinto del lugar de nacimiento y de la dirección exacta.';
comment on column public.clientes.codigo_postal is
  'Se deriva de vecindad_departamento + vecindad_municipio (ver js/core/geo-guatemala.js). Editable.';
comment on column public.clientes.dpi_fecha_vencimiento is
  'Un DPI vencido no identifica: la ficha lo avisa antes de armar una declaración jurada.';
comment on column public.clientes.dpi_version is
  'El número al pie del anverso (ej. 004). La SAT lo pide para actualizar datos en el RTU.';

-- Los que ya tenían el lugar de nacimiento en un solo texto conservan ese
-- valor; no se intenta partirlo automáticamente porque "Jutiapa, Santa
-- Catarina Mita" y "Santa Catarina Mita, Jutiapa" están ambos en los datos y
-- adivinar cuál es cuál pondría el departamento en el municipio.
