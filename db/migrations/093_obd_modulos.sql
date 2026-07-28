-- 093_obd_modulos.sql
-- Módulos (computadoras) que respondieron al escaneo, con su dirección.
-- Cada ECU contesta a la dirección de difusión con la suya propia, así que se
-- puede atribuir cada código de falla al módulo que lo reportó.
--
-- Forma: [{ ecu: 2024, nombre: 'Motor (ECM)' }, ...]
--
-- Alcance: sólo los módulos que la norma OBD-II obliga a responder (motor y,
-- si existe, transmisión). ABS, airbag, dirección eléctrica y clima usan UDS
-- propietario de cada marca y no aparecen aquí.
--
-- Los DTC de las columnas dtcs / dtcs_pendientes ganan además los campos
-- `ecu` y `modulo` para poder agruparlos por computadora.

alter table public.diagnosticos_obd
  add column if not exists modulos jsonb;

comment on column public.diagnosticos_obd.modulos is
  'Modulos que respondieron OBD-II con su direccion: [{ecu, nombre}]. No incluye ABS/airbag/EPS (UDS propietario)';
