-- ═══════════════════════════════════════════════════════════════
-- NexusPro Enterprise — Migración 118
-- Datos del cliente que exige una declaración jurada, guardados en su ficha.
--
-- La ley describe cómo debe identificarse quien declara: "nombres y
-- apellidos completos del solicitante, EDAD, ESTADO CIVIL, NACIONALIDAD,
-- PROFESIÓN u actividad a la que se dedica, número del documento de
-- identificación personal, dirección exacta del domicilio" (art. 55 a) de
-- la ley; art. 17 b) del reglamento; y el art. 72 a) 1 lo repite para la
-- licencia de portación).
--
-- Hasta ahora esos datos salían como rayas en blanco para llenar a mano en
-- CADA declaración, aunque fueran siempre los mismos del mismo cliente.
-- Ahora viven en su ficha y el documento sale lleno.
--
-- La EDAD no se guarda: se calcula de la fecha de nacimiento al generar el
-- documento. Guardar la edad la deja desactualizada el día del cumpleaños,
-- y una declaración jurada con la edad equivocada es un documento con un
-- dato falso — precisamente lo que no puede tener algo que se firma bajo
-- juramento.
--
-- `dpi`, `nit`, `direccion` y `vivienda` ya existían. Idempotente.
-- ═══════════════════════════════════════════════════════════════

alter table public.clientes
  add column if not exists fecha_nacimiento date,
  add column if not exists estado_civil text,
  add column if not exists profesion text,
  add column if not exists nacionalidad text;

alter table public.clientes drop constraint if exists clientes_estado_civil_check;
alter table public.clientes add constraint clientes_estado_civil_check
  check (estado_civil is null or estado_civil = any (array[
    'soltero(a)','casado(a)','unido(a)','divorciado(a)','viudo(a)'
  ]));

-- Una fecha de nacimiento futura, o de alguien de más de 120 años, es un
-- error de tecleo. Atajarlo acá evita una declaración con la edad absurda.
alter table public.clientes drop constraint if exists clientes_fecha_nacimiento_razonable;
alter table public.clientes add constraint clientes_fecha_nacimiento_razonable
  check (fecha_nacimiento is null
         or (fecha_nacimiento <= current_date and fecha_nacimiento > current_date - interval '120 years'));

comment on column public.clientes.fecha_nacimiento is
  'Para calcular la edad en las declaraciones juradas. La edad no se guarda: se deriva, porque guardada queda vencida cada cumpleaños.';
