-- 095_obd_equipamiento.sql
-- Equipamiento declarado por el vehículo, códigos permanentes y calibración.
--
-- Sirven para detectar lo que NO genera códigos: un DPF o un EGR eliminados del
-- software no dan falla, se ven porque el ECU deja de declarar su monitor.
--
--   permanentes   [{codigo,ecu}]  modo 0A — no se borran con la batería
--   readiness     {diesel, monitores[{nombre,bit,soportado,listo}]}  modo 01 PID 01
--   norma_obd     {codigo,nombre} PID 1C — ubica la región (EOBD, HD OBD, OBDBr…)
--   calibracion   {calid,cvn}     modo 09 — firma del software del ECU
--   equipamiento  {avisos[],origen,norma,calib}  análisis cruzado

--   costo         {monto,categoria,tipo}  tarifa del escaneo segun el vehiculo
--                 (Q250 liviano / Q750 camion), para pasarlo a la OT o factura

alter table public.diagnosticos_obd
  add column if not exists permanentes  jsonb,
  add column if not exists readiness    jsonb,
  add column if not exists norma_obd    jsonb,
  add column if not exists calibracion  jsonb,
  add column if not exists equipamiento jsonb,
  add column if not exists costo        jsonb;

-- El CVN es la firma de la calibración: comparar un vehículo contra OTROS DEL
-- MISMO MODELO que pasaron por el taller es lo que permite decir "a este le
-- reprogramaron la computadora". Sin índice, esa consulta recorre toda la tabla.
create index if not exists diagnosticos_obd_calib_idx
  on public.diagnosticos_obd ((calibracion->>'cvn'))
  where calibracion is not null;
